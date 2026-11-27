import { useEffect, useRef, useState, type RefObject } from "react";
import { readStored } from "../lib/appStorage";
import { streamGatewayChat } from "../lib/gatewayClient";
import { DEFAULT_CATALOG_MODEL_ID, findCatalogModel, type ModelSpec } from "../lib/modelCatalog";
import { generateOnDevice, isOnDeviceAIReady, prepareOnDeviceAI, supportsOnDeviceAI } from "../lib/onDeviceAI";

type Permission = { source: Window; requestId: string; nonce: string };

export function usePreviewAI(
  frame: RefObject<HTMLIFrameElement | null>,
  nonce: string,
  enabled: boolean,
  buildBusy: boolean,
  activeModel?: ModelSpec
) {
  const [permission, setPermission] = useState<Permission | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const permissionRef = useRef<Permission | null>(null);
  const buildBusyRef = useRef(buildBusy);
  buildBusyRef.current = buildBusy;
  const activeModelRef = useRef(activeModel);
  activeModelRef.current = activeModel;

  const send = (request: Permission, state: string, payload = "") =>
    request.source.postMessage(
      { type: "sujith-ai-result", nonce: request.nonce, requestId: request.requestId, state, payload },
      "*"
    );

  const load = async (request: Permission) => {
    if (busyRef.current || buildBusyRef.current) {
      send(request, "error", "Another local operation is running. Please wait.");
      return;
    }
    controller.current = new AbortController();
    busyRef.current = true;
    setBusy(true);
    try {
      await prepareOnDeviceAI(controller.current.signal, (text) => send(request, "progress", text));
      send(request, "ready");
    } catch (error) {
      send(request, "error", error instanceof Error ? error.message : "The model could not load.");
    } finally {
      controller.current = null;
      busyRef.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    const receive = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.nonce !== nonce) return;
      const { type, requestId } = event.data;
      if (!["sujith-ai-load", "sujith-ai-generate", "sujith-ai-chat", "sujith-ai-abort"].includes(type) || typeof requestId !== "string" || requestId.length > 100) {
        return;
      }
      if (type === "sujith-ai-abort") {
        controller.current?.abort();
        return;
      }
      const request = { source: event.source as Window, requestId, nonce };
      if (busyRef.current || buildBusyRef.current) {
        send(request, "error", "Another AI operation is running. Please wait.");
        return;
      }

      if (type === "sujith-ai-load") {
        if (!supportsOnDeviceAI()) {
          send(request, "error", "This browser does not support WebGPU. The source is ready to export, but local AI needs a supported browser.");
          return;
        }
        if (isOnDeviceAIReady()) send(request, "ready");
        else {
          permissionRef.current = request;
          setPermission(request);
        }
        return;
      }

      const turns = event.data.turns;
      if (
        !Array.isArray(turns) ||
        turns.length === 0 ||
        turns.length > 12 ||
        turns.some(
          (turn) =>
            !turn ||
            !["user", "assistant", "system"].includes(turn.role) ||
            typeof turn.content !== "string" ||
            turn.content.length > 10000
        )
      ) {
        send(request, "error", "Invalid conversation payload (max 12 turns, 10,000 chars per turn).");
        return;
      }

      if (type === "sujith-ai-chat") {
        const model =
          activeModelRef.current ??
          findCatalogModel(readStored<string>("sujith-ide.selected-model.v1", DEFAULT_CATALOG_MODEL_ID));
        const opts = (event.data.options && typeof event.data.options === "object") ? event.data.options as { temperature?: number; maxTokens?: number; systemPrompt?: string } : {};
        const baseMessages = turns.map((turn: { role: "system" | "user" | "assistant"; content: string }) => ({
          role: turn.role,
          content: turn.content,
        }));
        const customSys = typeof opts.systemPrompt === "string" && opts.systemPrompt.trim() ? opts.systemPrompt.trim().slice(0, 4000) : "";
        const messages = customSys && !baseMessages.some((m) => m.role === "system")
          ? [{ role: "system" as const, content: customSys }, ...baseMessages]
          : baseMessages;
        controller.current = new AbortController();
        busyRef.current = true;
        setBusy(true);
        try {
          const answer = await streamGatewayChat({
            model,
            messages,
            conversationId: `preview-${nonce}`,
            temperature: typeof opts.temperature === "number" ? opts.temperature : undefined,
            maxTokens: typeof opts.maxTokens === "number" ? opts.maxTokens : undefined,
            signal: controller.current.signal,
            onDelta: (text) => send(request, "text", text),
          });
          send(request, "done", answer);
        } catch (error) {
          send(request, "error", error instanceof Error ? error.message : "AI request failed.");
        } finally {
          controller.current = null;
          busyRef.current = false;
          setBusy(false);
        }
        return;
      }

      // Existing on-device WebGPU generation path
      if (!isOnDeviceAIReady()) {
        send(request, "error", "Load the on-device model before sending a message.");
        return;
      }
      controller.current = new AbortController();
      busyRef.current = true;
      setBusy(true);
      try {
        const answer = await generateOnDevice({
          prompt: turns.map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`).join("\n\n").slice(-14000) + "\n\nAssistant:",
          system: "You are a helpful assistant. Answer the last user message accurately and concisely. Do not invent access to tools or internet.",
          signal: controller.current.signal,
          maxTokens: 512,
          onProgress: () => {},
          onText: (text) => send(request, "text", text),
        });
        send(request, "done", answer);
      } catch (error) {
        send(request, "error", error instanceof Error ? error.message : "Local generation stopped.");
      } finally {
        controller.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      controller.current?.abort();
      permissionRef.current = null;
      setPermission(null);
    };
  }, [enabled, frame, nonce]);

  return {
    permission: permission !== null,
    busy,
    approve: () => {
      const request = permissionRef.current;
      permissionRef.current = null;
      setPermission(null);
      if (request) void load(request);
    },
    decline: () => {
      const request = permissionRef.current;
      permissionRef.current = null;
      setPermission(null);
      if (request) send(request, "error", "Model download was not started. You can choose to load it later.");
    },
  };
}
