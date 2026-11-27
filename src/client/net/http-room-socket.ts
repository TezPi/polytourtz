import type { ServerMessage } from "../../shared/protocol/index.js";

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

let cachedTransport: "http" | "ws" | null = null;

async function detectTransport(): Promise<"http" | "ws"> {
  if (cachedTransport !== null) return cachedTransport;
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { transport?: unknown };
      cachedTransport = data.transport === "http" ? "http" : "ws";
      return cachedTransport;
    }
  } catch {
    /* Fall back to WebSocket attempt when health endpoint is unreachable. */
  }
  return "ws";
}

type RpcPayload = {
  readonly messages?: readonly ServerMessage[];
  readonly lobbyDigest?: string;
  readonly youDigest?: string;
  readonly randomnessDigest?: string;
};

/**
 * Exposes the standard WebSocket callback surface over HTTP RPC + polling on
 * Vercel serverless deployments while keeping native WebSockets on Cloudflare
 * Workers and local Vite dev.
 */
export function createRoomSocket(roomCode: string, token: string): WebSocket {
  let state = CONNECTING;
  let realSocket: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let queue: Promise<void> = Promise.resolve();
  let lastSeq: number | null = null;
  let lobbyDigest: string | null = null;
  let youDigest: string | null = null;
  let randomnessDigest: string | null = null;
  let lobbyStatus: "lobby" | "playing" | "finished" = "lobby";

  let onOpenFn: ((event: Event) => void) | null = null;
  let onMessageFn: ((event: MessageEvent) => void) | null = null;
  let onErrorFn: ((event: Event) => void) | null = null;
  let onCloseFn: ((event: CloseEvent) => void) | null = null;

  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  function dispatch(type: string, event: Event): void {
    if (type === "open") onOpenFn?.(event);
    else if (type === "message") onMessageFn?.(event as MessageEvent);
    else if (type === "error") onErrorFn?.(event);
    else if (type === "close") onCloseFn?.(event as CloseEvent);
    const set = listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) {
      if (typeof listener === "function") listener.call(facade, event);
      else listener.handleEvent(event);
    }
  }

  function closeLocal(code: number, reason: string): void {
    if (state === CLOSED) return;
    state = CLOSED;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    abortController?.abort();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    dispatch(
      "close",
      new CloseEvent("close", { code, reason, wasClean: code === 1000 }),
    );
  }

  function trackMessages(payload: RpcPayload): void {
    if (payload.lobbyDigest !== undefined) lobbyDigest = payload.lobbyDigest;
    if (payload.youDigest !== undefined) youDigest = payload.youDigest;
    if (payload.randomnessDigest !== undefined) {
      randomnessDigest = payload.randomnessDigest;
    }
    for (const message of payload.messages ?? []) {
      if (message.type === "welcome") {
        lastSeq = message.seq;
        lobbyStatus = message.lobby.status;
      } else if (message.type === "events") {
        lastSeq = message.toSeq;
      } else if (message.type === "lobby") {
        lobbyStatus = message.lobby.status;
      }
      if (state !== OPEN) return;
      dispatch(
        "message",
        new MessageEvent("message", { data: JSON.stringify(message) }),
      );
    }
  }

  function pollDelayMs(): number {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return 4_000;
    }
    return lobbyStatus === "playing" ? 550 : 1_000;
  }

  function schedulePoll(): void {
    if (state !== OPEN || realSocket !== null) return;
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => {
      pollTimer = null;
      if (state !== OPEN) return;
      enqueueRpc(
        {
          message: { type: "sync", lastSeq },
          lastSeq,
          poll: true,
          knownLobby: lobbyDigest,
          knownYou: youDigest,
          knownRandomness: randomnessDigest,
        },
        true,
      );
    }, pollDelayMs());
  }

  function onVisibilityChange(): void {
    if (
      state === OPEN &&
      realSocket === null &&
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      enqueueRpc(
        {
          message: { type: "sync", lastSeq },
          lastSeq,
          poll: true,
          knownLobby: lobbyDigest,
          knownYou: youDigest,
          knownRandomness: randomnessDigest,
        },
        true,
      );
    }
  }

  function enqueueRpc(body: Record<string, unknown>, fromPoll: boolean): void {
    queue = queue.then(async () => {
      if (state !== OPEN) return;
      let response: Response | undefined;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (state !== OPEN) return;
        abortController = new AbortController();
        try {
          response = await fetch(`/api/rooms/${roomCode}/rpc`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
            signal: abortController.signal,
          });
        } catch (error) {
          if (state !== OPEN) return;
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          dispatch("error", new Event("error"));
          closeLocal(1006, "Network error");
          return;
        }
        if (state !== OPEN) return;
        if (
          (response.status === 409 || response.status === 503) &&
          attempt + 1 < 4
        ) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              150 * (attempt + 1) + Math.floor(Math.random() * 80),
            ),
          );
          continue;
        }
        break;
      }
      if (!response || state !== OPEN) return;
      if (response.status === 401 || response.status === 403) {
        closeLocal(4003, "Not admitted");
        return;
      }
      if (response.status === 404) {
        closeLocal(1000, "Room expired");
        return;
      }
      if (!response.ok) {
        if (!fromPoll) dispatch("error", new Event("error"));
        closeLocal(1006, `HTTP ${response.status}`);
        return;
      }
      try {
        const payload = (await response.json()) as RpcPayload;
        trackMessages(payload);
        if (state === OPEN) schedulePoll();
      } catch {
        if (state !== OPEN) return;
        dispatch("error", new Event("error"));
        closeLocal(1006, "Network error");
      }
    });
  }

  const facade = {
    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED,
    binaryType: "blob" as BinaryType,
    bufferedAmount: 0,
    extensions: "",
    protocol: "polytour",
    url: `${window.location.origin}/api/rooms/${roomCode}/rpc`,
    get readyState() {
      return realSocket ? realSocket.readyState : state;
    },
    get onopen() {
      return onOpenFn;
    },
    set onopen(fn: ((event: Event) => void) | null) {
      onOpenFn = fn;
      if (realSocket) realSocket.onopen = fn;
    },
    get onmessage() {
      return onMessageFn;
    },
    set onmessage(fn: ((event: MessageEvent) => void) | null) {
      onMessageFn = fn;
      if (realSocket) realSocket.onmessage = fn;
    },
    get onerror() {
      return onErrorFn;
    },
    set onerror(fn: ((event: Event) => void) | null) {
      onErrorFn = fn;
      if (realSocket) realSocket.onerror = fn;
    },
    get onclose() {
      return onCloseFn;
    },
    set onclose(fn: ((event: CloseEvent) => void) | null) {
      onCloseFn = fn;
      if (realSocket) realSocket.onclose = fn;
    },
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (realSocket) {
        realSocket.addEventListener(type, listener, options);
        return;
      }
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) {
      if (realSocket) {
        realSocket.removeEventListener(type, listener, options);
        return;
      }
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event): boolean {
      dispatch(event.type, event);
      return true;
    },
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (realSocket) {
        realSocket.send(data as Parameters<WebSocket["send"]>[0]);
        return;
      }
      if (state !== OPEN) return;
      const parsed = JSON.parse(String(data)) as unknown;
      if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      enqueueRpc({ message: parsed, lastSeq }, false);
    },
    close(code = 1000, reason = "") {
      if (realSocket) {
        state = CLOSING;
        realSocket.close(code, reason);
        return;
      }
      if (state === CLOSED || state === CLOSING) return;
      state = CLOSING;
      closeLocal(code, reason);
    },
  } as unknown as WebSocket;

  void detectTransport().then((transport) => {
    if (state === CLOSING || state === CLOSED) return;
    if (transport === "http") {
      state = OPEN;
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVisibilityChange);
      }
      dispatch("open", new Event("open"));
      return;
    }
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${scheme}://${window.location.host}/ws/room/${roomCode}`,
      ["polytour", `seat.${token}`],
    );
    realSocket = ws;
    if (onOpenFn) ws.onopen = onOpenFn;
    if (onMessageFn) ws.onmessage = onMessageFn;
    if (onErrorFn) ws.onerror = onErrorFn;
    if (onCloseFn) ws.onclose = onCloseFn;
    for (const [type, set] of listeners) {
      for (const listener of set) {
        ws.addEventListener(type, listener);
      }
    }
  });

  return facade;
}
