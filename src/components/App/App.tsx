import type MediasoupClient from "mediasoup-client";
import React from "react";
import { Alert, Loader, Menu, Overlay, Title } from "@mantine/core";
import io, { Socket } from "socket.io-client";
import {
  formatSpeed,
  iceServers,
  isMobile,
  serverPath,
  testAutoplay,
  openFileSelector,
  getOrCreateClientId,
  getOrCreateSessionId,
  calculateMedian,
  isYouTube,
  isMagnet,
  isHttp,
  isHls,
  isScreenShare,
  isFileShare,
  isVBrowser,
  isDash,
  softWhite,
  getSavedPasswords,
} from "../../utils/utils";
import { Chat } from "../Chat/Chat";
import { TopBar } from "../TopBar/TopBar";
import { VBrowser } from "../VBrowser/VBrowser";
import { getCurrentSettings } from "../Settings/LocalSettings";
import { MultiStreamModal } from "../Modal/MultiStreamModal";
import { ComboBox } from "../ComboBox/ComboBox";
import { SearchComponent } from "../SearchComponent/SearchComponent";
import { Controls } from "../Controls/Controls";
import { SettingsModal } from "../Settings/SettingsModal";
import { ErrorModal } from "../Modal/ErrorModal";
import { PasswordModal } from "../Modal/PasswordModal";
import {
  FileShareModal,
  type UploadedMedia,
  type UploadOptions,
} from "../Modal/FileShareModal";
import { SubtitleModal } from "../Modal/SubtitleModal";
import { HTML } from "./HTML";
import { YouTube } from "./YouTube";
import styles from "./App.module.css";
import config from "../../config";
import { MetadataContext } from "../../MetadataContext";
import ChatVideoCard from "../ChatVideoCard/ChatVideoCard";
import { ActionIcon, Badge, Button } from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconArrowsMinimize,
  IconFile,
  IconList,
  IconMessageCircle,
  IconSettings,
  IconVolume,
  IconX,
} from "@tabler/icons-react";
import type WebTorrent from "webtorrent";
import type Hls from "hls.js";
import { type MediaPlayerClass } from "dashjs";
import { type Torrent } from "webtorrent";
import { t } from "../../i18n";

declare global {
  interface Window {
    onYouTubeIframeAPIReady: any;
    YT: YT.JsApi;
    watchparty: {
      ourStream: MediaStream | undefined;
      videoRefs: HTMLVideoElementDict;
      videoPCs: PCDict;
      webtorrent?: WebTorrent.Instance;
      hls?: Hls;
      dash?: MediaPlayerClass;
    };
  }
}

window.watchparty = {
  ourStream: undefined,
  videoRefs: {},
  videoPCs: {},
};

const clientId = getOrCreateClientId();
const isCompactViewport = () =>
  isMobile() ||
  (typeof window !== "undefined" &&
    (window.matchMedia("(max-width: 900px)").matches ||
      (navigator.maxTouchPoints > 0 &&
        window.matchMedia("(max-width: 1366px)").matches)));

interface AppProps {
  vanity?: string;
  urlRoomId?: string;
}

interface AppState {
  state: "starting" | "connected";
  roomMedia: string;
  roomSubtitle: string;
  roomPaused: boolean;
  roomLoop: boolean;
  participants: User[];
  rosterUpdateTS: Number;
  chat: ChatMessage[];
  playlist: PlaylistVideo[];
  tsMap: NumberDict;
  nameMap: StringDict;
  myName: string;
  loading: boolean;
  scrollTimestamp: number;
  unreadCount: number;
  fullScreen: boolean;
  fullscreenChatOpen: boolean;
  fullscreenControlsVisible: boolean;
  fullscreenChatMessage: ChatMessage | null;
  fullscreenChatUnread: boolean;
  fullscreenChatButtonOffset: { x: number; y: number };
  fullscreenChatPanelOffset: { x: number; y: number };
  controlsTimestamp: number;
  watchOptions: SearchResult[];
  isVBrowser: boolean;
  isAutoPlayable: boolean;
  downloaded: number;
  total: number;
  speed: number;
  connections: number;
  fileSelection: {
    name: string;
    url: string;
    length: number;
    playFn?: () => void;
  }[];
  overlayMsg: string;
  isErrorAuth: boolean;
  settings: Settings;
  vBrowserResolution: string;
  vBrowserQuality: string;
  isVBrowserLarge: boolean;
  nonPlayableMedia: boolean;
  currentTab: string;
  isFileShareModalOpen: boolean;
  isSubtitleModalOpen: boolean;
  isMultiSelectModalOpen: boolean;
  roomLock: string;
  controller?: string;
  savedPasswords: StringDict;
  roomId: string;
  errorMessage: string;
  successMessage: string;
  warningMessage: string;
  isChatDisabled: boolean;
  showChatColumn: boolean;
  owner: string | undefined;
  vanity: string | undefined;
  password: string | undefined;
  inviteLink: string;
  roomTitle: string | undefined;
  roomDescription: string | undefined;
  roomTitleColor: string | undefined;
  mediaPath: string | undefined;
  roomPlaybackRate: number;
  isLiveStream: boolean;
  managedMediaDuration: number | undefined;
  settingsModalOpen: boolean;
  uploadController: AbortController | undefined;
}

export class App extends React.Component<AppProps, AppState> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  state: AppState = {
    state: "starting",
    roomMedia: "",
    roomPaused: false,
    roomSubtitle: "",
    roomLoop: false,
    participants: [],
    rosterUpdateTS: Date.now(),
    chat: [],
    playlist: [],
    tsMap: {},
    nameMap: {},
    myName: "",
    loading: true,
    scrollTimestamp: 0,
    unreadCount: 0,
    fullScreen: false,
    fullscreenChatOpen: false,
    fullscreenControlsVisible: true,
    fullscreenChatMessage: null,
    fullscreenChatUnread: false,
    fullscreenChatButtonOffset: { x: 0, y: 0 },
    fullscreenChatPanelOffset: { x: 0, y: 0 },
    controlsTimestamp: 0,
    watchOptions: [],
    isVBrowser: false,
    isAutoPlayable: true,
    downloaded: 0,
    total: 0,
    speed: 0,
    connections: 0,
    fileSelection: [],
    overlayMsg: "",
    isErrorAuth: false,
    settings: {},
    vBrowserResolution: "1280x720@30",
    vBrowserQuality: "1",
    isVBrowserLarge: false,
    nonPlayableMedia: false,
    currentTab:
      new URLSearchParams(window.location.search).get("tab") ?? "chat",
    isFileShareModalOpen: false,
    isSubtitleModalOpen: false,
    isMultiSelectModalOpen: false,
    roomLock: "",
    controller: "",
    roomId: "",
    savedPasswords: {},
    errorMessage: "",
    successMessage: "",
    warningMessage: "",
    isChatDisabled: false,
    showChatColumn: isCompactViewport()
      ? false
      : Boolean(
          Number(
            window.localStorage.getItem("watchparty-showchatcolumn") ?? "1",
          ),
        ),
    owner: undefined,
    vanity: undefined,
    password: undefined,
    inviteLink: "",
    roomTitle: "",
    roomDescription: "",
    roomTitleColor: "",
    mediaPath: undefined,
    roomPlaybackRate: 0,
    isLiveStream: false,
    managedMediaDuration: undefined,
    settingsModalOpen: false,
    uploadController: undefined,
  };
  socket: Socket = null!;
  mediasoupPubSocket: Socket | null = null;
  mediasoupSubSocket: Socket | null = null;
  ytDebounce = true;
  localStreamToPublish?: MediaStream;
  isLocalStreamAFile = false;
  publisherConns: PCDict = {};
  consumerConn?: RTCPeerConnection;
  progressUpdater?: number;
  heartbeat: number | undefined = undefined;
  fullscreenControlsTimer: number | undefined;
  fullscreenControlsTimerGeneration = 0;
  managedMediaRequestGeneration = 0;
  isUnmounted = false;
  lastHardSyncAt = 0;
  fullscreenMessageTimer: number | undefined;
  fullscreenChatDrag:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        originX: number;
        originY: number;
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
        moved: boolean;
      }
    | undefined;
  fullscreenChatPanelDrag:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        originX: number;
        originY: number;
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      }
    | undefined;
  YouTubeInterface: YouTube = new YouTube(null);
  HTMLInterface: HTML = new HTML("leftVideo");
  Player = () => {
    if (this.usingYoutube()) {
      return this.YouTubeInterface;
    } else {
      return this.HTMLInterface;
    }
  };

  chatRef = React.createRef<Chat>();

  async componentDidMount() {
    this.isUnmounted = false;
    document.addEventListener("fullscreenchange", this.onFullScreenChange);
    document.addEventListener("keydown", this.onKeydown);
    window.addEventListener("resize", this.syncVisualViewport);
    window.addEventListener("orientationchange", this.syncVisualViewport);
    window.visualViewport?.addEventListener("resize", this.syncVisualViewport);
    window.visualViewport?.addEventListener("scroll", this.syncVisualViewport);
    this.syncVisualViewport();

    // Send heartbeat to the server
    this.heartbeat = window.setInterval(
      () => {
        fetch(serverPath + "/ping");
      },
      10 * 60 * 1000,
    );

    const canAutoplay = await testAutoplay();
    this.setState({ isAutoPlayable: canAutoplay });
    this.loadSettings();
    this.loadYouTube();
    this.init();
  }

  componentWillUnmount() {
    this.isUnmounted = true;
    document.removeEventListener("fullscreenchange", this.onFullScreenChange);
    document.removeEventListener("keydown", this.onKeydown);
    window.removeEventListener("resize", this.syncVisualViewport);
    window.removeEventListener("orientationchange", this.syncVisualViewport);
    window.visualViewport?.removeEventListener(
      "resize",
      this.syncVisualViewport,
    );
    window.visualViewport?.removeEventListener(
      "scroll",
      this.syncVisualViewport,
    );
    this.clearFullscreenControlsTimer();
    this.clearFullscreenMessageTimer();
    document.documentElement.classList.remove("watch-fullscreen");
    document.body.classList.remove("watch-fullscreen");
    window.clearInterval(this.heartbeat);
  }

  init = async () => {
    let roomId = "/" + this.props.urlRoomId;
    // if a vanity name, resolve the url to a room id
    if (this.props.vanity) {
      const resp = await fetch(
        serverPath + "/resolveRoom/" + this.props.vanity,
      );
      if (!resp.ok) {
        this.setState({ overlayMsg: "Couldn't load this room." });
        return;
      }
      const data = await resp.json();
      if (!data?.roomId) {
        this.setState({ overlayMsg: "Couldn't load this room." });
        return;
      }
      roomId = data.roomId;
    }
    this.setState({ roomId }, () => {
      this.join(roomId);
    });
  };

  join = async (roomId: string) => {
    const password = getSavedPasswords()[roomId] ?? "";
    const response = await fetch(serverPath + "/resolveShard" + roomId);
    const shard = Number(await response.text()) || "";
    const socket = io(serverPath + roomId, {
      transports: ["websocket"],
      withCredentials: true,
      query: {
        clientId,
        password,
        shard,
        roomId: roomId.slice(1),
      },
      auth: {
        sessionId: getOrCreateSessionId(),
      },
    });
    this.socket = socket;
    socket.on("connect", async () => {
      this.setState({
        state: "connected",
        overlayMsg: "",
        errorMessage: "",
        successMessage: "",
        warningMessage: "",
      });
      this.updateName(this.context.user?.username || "user");
      // Re-join video chat if we were in it before the reconnection
      if (window.watchparty.ourStream) {
        socket.emit("CMD:joinVideo");
      }
    });
    socket.on("connect_error", (err: any) => {
      console.error(err);
      if (err.message === "Invalid namespace") {
        this.setState({ overlayMsg: "Couldn't load this room." });
      } else if (err.message === "password") {
        this.setState({ isErrorAuth: true });
      } else {
        this.setState({ overlayMsg: err?.message ?? "An error occurred" });
      }
    });
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        // the disconnection was initiated by the server, you need to reconnect manually
        this.setState({ overlayMsg: "Disconnected from server." });
      } else {
        // else the socket will automatically try to reconnect
        // Use the alert pill since it's less disruptive
        this.setState({ warningMessage: "Reconnecting..." });
      }
    });
    socket.on("errorMessage", (err: string) => {
      this.setState({ errorMessage: err });
      setTimeout(() => {
        this.setState({ errorMessage: "" });
      }, 3000);
    });
    socket.on("successMessage", (success: string) => {
      this.setState({ successMessage: success });
      setTimeout(() => {
        this.setState({ successMessage: "" });
      }, 3000);
    });
    socket.on("kicked", () => {
      window.location.assign("/");
    });
    socket.on("REC:play", () => {
      this.localPlay();
    });
    socket.on("REC:pause", () => {
      this.localPause();
    });
    socket.on("REC:seek", (data: number) => {
      this.localSeek(data);
    });
    socket.on("REC:playbackRate", (data: number) => {
      this.setState({ roomPlaybackRate: data });
      if (data > 0) {
        this.Player().setPlaybackRate(data);
      }
    });
    socket.on("REC:subtitle", (data: string) => {
      this.setState({ roomSubtitle: data }, () => {
        this.Player().loadSubtitles(data);
      });
    });
    socket.on("REC:loop", (data: boolean) => {
      this.setState({ roomLoop: data });
    });
    socket.on("REC:changeController", (data: string) => {
      this.setState({ controller: data });
    });
    socket.on("REC:host", async (data: HostState) => {
      let currentMedia = data.video || "";
      if (this.playingScreenShare() && !isScreenShare(currentMedia)) {
        this.stopPublishingLocalStream();
      }
      if (this.playingFileShare() && !isFileShare(currentMedia)) {
        this.stopPublishingLocalStream();
      }
      if (this.playingVBrowser() && !isVBrowser(currentMedia)) {
        this.stopVBrowser();
      }
      if (this.playingScreenShare() && isScreenShare(currentMedia)) {
        // Ignore, it's probably a reconnection
        return;
      }
      if (this.playingFileShare() && isFileShare(currentMedia)) {
        // Ignore, it's probably a reconnection
        return;
      }
      if (
        this.playingVBrowser() &&
        this.getVBrowserHost() &&
        isVBrowser(currentMedia)
      ) {
        // Ignore, it's probably a reconnection
        return;
      }
      this.setState(
        {
          roomMedia: currentMedia,
          roomPaused: data.paused,
          roomSubtitle: data.subtitle,
          roomLoop: data.loop,
          roomPlaybackRate: data.playbackRate,
          loading: Boolean(data.video),
          nonPlayableMedia: false,
          isVBrowserLarge: data.isVBrowserLarge,
          vBrowserResolution: "1280x720@30",
          vBrowserQuality: "1",
          controller: data.controller,
          isLiveStream: false,
          managedMediaDuration:
            currentMedia === this.state.roomMedia
              ? this.state.managedMediaDuration
              : undefined,
        },
        async () => {
          void this.loadManagedMediaDuration(currentMedia);
          const leftVideo = this.HTMLInterface.getVideoEl();

          // Stop all players
          // Unless the user is sharing a file, because we play it in leftVideo and capture stream
          if (!this.isLocalStreamAFile) {
            this.HTMLInterface.pauseVideo();
          }
          this.YouTubeInterface.stopVideo();

          if (!this.isLocalStreamAFile) {
            this.Player().clearState();
          }
          if (data.subtitle) {
            this.Player().loadSubtitles(data.subtitle);
          }
          if (data.playbackRate) {
            this.Player().setPlaybackRate(data.playbackRate);
          }

          if (
            this.playingScreenShare() ||
            this.playingFileShare() ||
            this.playingVBrowser()
          ) {
            console.log(
              "exiting REC:host since we are using webRTC (fileshare, screenshare, or vbrowser). Check setupRTCConnections()",
            );
            if (!(this.playingVBrowser() && !this.getVBrowserHost())) {
              // Remove the loader unless we're waiting for a vbrowser
              this.setLoadingFalse();
            }
            return;
          }
          if (this.usingYoutube() && !this.YouTubeInterface.isReady()) {
            console.log(
              "YT player not ready, onReady callback will retry when it is",
            );
            return;
          }
          const src = data.video;
          const time = data.videoTS;
          if (isMagnet(src)) {
            // WebTorrent
            if (!window.watchparty.webtorrent) {
              const WebTorrent = //@ts-expect-error
                (await import("webtorrent/dist/webtorrent.min.js")).default;
              window.watchparty.webtorrent = new WebTorrent();
              const reg = await navigator.serviceWorker?.register("/sw.min.js");
              const worker = reg.active || reg.waiting || reg.installing;
              const checkState = (worker: ServiceWorker | null) => {
                if (worker?.state === "activated") {
                  return window.watchparty.webtorrent?.createServer({
                    controller: reg,
                  });
                }
                return null;
              };
              if (!checkState(worker)) {
                worker?.addEventListener("statechange", ({ target }) =>
                  checkState(target as ServiceWorker),
                );
              }
            }
            await new Promise(async (resolve) => {
              const finish = (torrent: Torrent) => {
                // Got torrent metadata!
                console.log("Client is downloading:", torrent.infoHash);

                // Torrents can contain many files.
                const files = torrent.files;
                const fileIndex = new URLSearchParams(src).get("fileIndex");
                // Try to find a single large file to play
                let target;
                if (fileIndex != null && fileIndex !== "") {
                  target = files[Number(fileIndex)];
                }
                if (!target) {
                  // Open the selector
                  // Selecting a file sets a new URL with the fileIndex set so we go through again
                  this.setMultiSelectModal(true);
                  this.setFileSelection(
                    files.map((f: WebTorrent.TorrentFile, i: number) => ({
                      name: f.name,
                      url: src + `&fileIndex=${i}`,
                      length: f.length,
                    })),
                  );
                } else {
                  //@ts-expect-error
                  target.streamTo(leftVideo);
                }
                resolve(undefined);
              };
              let target = await window.watchparty.webtorrent?.get(src);
              if (!target) {
                target = window.watchparty.webtorrent?.add(src, {
                  announce: [
                    "wss://tracker.btorrent.xyz",
                    "wss://tracker.openwebtorrent.com",
                  ],
                  destroyStoreOnDestroy: true,
                  maxWebConns: 4,
                  path: "/tmp/webtorrent/",
                  storeCacheSlots: 20,
                  strategy: "sequential",
                  // noPeersIntervalTime: 30,
                });
              }
              if (target?.ready) {
                finish(target);
              } else {
                target?.on("ready", () => {
                  finish(target);
                });
              }
            });
          } else if (isDash(src)) {
            if (!window.watchparty.dash) {
              const Dash = await import("dashjs");
              window.watchparty.dash = Dash.MediaPlayer().create();
              window.watchparty.dash.on("streamInitialized", (_e: any) => {
                // for a live stream:
                // html.currenttime is time since stream start
                // html.duration is infinite
                // player.duration is the seekable range
                const isLiveStream = this.Player().getDuration() >= Infinity;
                console.log("DASH stream initialized: isLive %s", isLiveStream);
                this.setState({
                  isLiveStream,
                });
              });
            }
            window.watchparty.dash.initialize(leftVideo, src);
          } else if (isHls(src) && window.MediaSource) {
            // Prefer using hls.js if MediaSource Extensions are supported
            // otherwise fallback to native HLS support using video tag (i.e. iPhones)
            if (!window.watchparty.hls) {
              const Hls = (await import("hls.js")).default;
              window.watchparty.hls = new Hls();
              window.watchparty.hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
                const isLiveStream =
                  data.details.live && !this.isManagedProgressiveHls();
                this.setState({ isLiveStream });
                console.log("HLS level loaded: isLive %s", isLiveStream);
              });
            }
            window.watchparty.hls.loadSource(src);
            window.watchparty.hls.attachMedia(leftVideo);
          }
          // else if (isMpegTs(src)) {
          //   const mpegts = (await import('mpegts.js')).default;
          //   let player = mpegts.createPlayer({
          //     type: 'mse', // could also be mpegts, m2ts, flv
          //     // isLive: true,
          //     url: src,
          //   });
          //   player.attachMediaElement(leftVideo);
          //   player.load();
          //   player.play();
          // }
          else {
            await this.Player().setSrcAndTime(src, time);
          }
          // Start this video
          if (!data.paused) {
            this.localPlay();
          }
          // Do right before playing
          leftVideo?.addEventListener(
            "canplay",
            () => {
              this.setLoadingFalse();
              let ts = undefined;
              // WebTorrent and Hls and Dash reset position back to 0 so set it back here
              if (
                isMagnet(src) ||
                isHls(src) ||
                isDash(src) ||
                this.state.isLiveStream
              ) {
                ts = time;
              }
              // Resync to leader since the loading might have taken some time
              this.localSeek(ts);
              if (this.state.uploadController) {
                // Jump back to the start of the video
                this.roomSeek(0);
              }
              if (data.playbackRate) {
                // Set playback rate again since it might have been lost
                console.log("setting playback rate again", data.playbackRate);
                this.Player().setPlaybackRate(data.playbackRate);
              }
            },
            { once: true },
          );

          // Progress updater
          window.clearInterval(this.progressUpdater);
          this.setState({ downloaded: 0, total: 0, speed: 0 });
          if (currentMedia.includes("/stream?torrent=magnet")) {
            this.progressUpdater = window.setInterval(async () => {
              const response = await fetch(
                currentMedia.replace("/stream", "/progress"),
              );
              const data = await response.json();
              this.setState({
                downloaded: data.downloaded,
                total: data.total,
                speed: data.speed,
                connections: data.connections,
              });
            }, 1000);
          }
          if (isMagnet(currentMedia)) {
            this.progressUpdater = window.setInterval(async () => {
              const client = window.watchparty.webtorrent;
              if (client) {
                this.setState({
                  downloaded: client.torrents[0]?.downloaded,
                  total: client.torrents[0]?.length,
                  speed: client.torrents[0]?.downloadSpeed,
                  connections: client.torrents[0]?.numPeers,
                });
              }
            }, 1000);
          }
        },
      );
    });
    socket.on("REC:chat", (data: ChatMessage) => {
      if (
        !getCurrentSettings().disableChatSound &&
        !data.system &&
        ((document.visibilityState && document.visibilityState !== "visible") ||
          this.state.currentTab !== "chat")
      ) {
        new Audio("/clearly.mp3").play();
      }
      const isTextMessage = !data.system && !data.cmd && Boolean(data.msg);
      this.setState((state) => ({
        chat: [...state.chat, data].slice(-100),
        scrollTimestamp: Date.now(),
        fullscreenChatUnread:
          isTextMessage &&
          data.id !== clientId &&
          state.fullScreen &&
          !state.fullscreenChatOpen
            ? true
            : state.fullscreenChatUnread,
        unreadCount:
          state.currentTab === "chat"
            ? state.unreadCount
            : state.unreadCount + 1,
      }));
      if (isTextMessage && this.state.fullScreen) {
        this.showFullscreenMessage(data);
      }
    });
    socket.on("REC:addReaction", (data: Reaction) => {
      const { chat } = this.state;
      const msgIndex = chat.findIndex(
        (m) => m.id === data.msgId && m.timestamp === data.msgTimestamp,
      );
      if (msgIndex === -1) {
        return;
      }
      const msg = chat[msgIndex];
      msg.reactions = msg.reactions || {};
      msg.reactions[data.value] = msg.reactions[data.value] || [];
      msg.reactions[data.value].push(data.user);
      this.setState({ chat }, () => {
        // if we add a reaction to the last message we need to scroll down
        // or else the reaction icon might be hidden
        if (
          msgIndex === chat.length - 1 &&
          this.chatRef.current?.state.isNearBottom
        ) {
          this.chatRef.current?.scrollToBottom();
        }
      });
    });
    socket.on("REC:removeReaction", (data: Reaction) => {
      const { chat } = this.state;
      const msg = chat.find(
        (m) => m.id === data.msgId && m.timestamp === data.msgTimestamp,
      );
      if (!msg || !msg.reactions?.[data.value]) {
        return;
      }
      msg.reactions[data.value] = msg.reactions[data.value].filter(
        (id) => id !== data.user,
      );
      this.setState({ chat });
    });
    socket.on("REC:tsMap", (data: NumberDict) => {
      this.setState({ tsMap: data }, () => {
        const localTime = Number(data[clientId]);
        const leader = this.getLeaderTime();
        const delta = leader - localTime;
        if (
          !this.state.isLiveStream &&
          this.hasDuration() &&
          Number.isFinite(localTime) &&
          Number.isFinite(leader)
        ) {
          const now = Date.now();
          if (Math.abs(delta) > 2.5 && now - this.lastHardSyncAt > 4000) {
            this.lastHardSyncAt = now;
            this.localSeek(leader);
            if (this.state.roomPlaybackRate === 0) {
              this.Player().setPlaybackRate(1);
            }
          } else if (this.state.roomPaused && Math.abs(delta) > 0.3) {
            this.localSeek(leader);
            if (this.state.roomPlaybackRate === 0) {
              this.Player().setPlaybackRate(1);
            }
          } else if (
            !this.state.roomPaused &&
            this.state.roomPlaybackRate === 0
          ) {
            let playbackRate = 1;
            if (delta > 0.18) {
              playbackRate = 1 + Math.min(0.06, delta * 0.02);
            } else if (delta < -0.18) {
              playbackRate = 1 - Math.min(0.06, Math.abs(delta) * 0.02);
            }
            playbackRate = Number(playbackRate.toFixed(2));
            if (this.Player().getPlaybackRate() !== playbackRate) {
              this.Player().setPlaybackRate(playbackRate);
            }
          }
        }
        if (this.state.roomSubtitle) {
          const sharer = this.state.participants.find((p) => p.isScreenShare);
          if (sharer && sharer.id !== clientId) {
            // Sync only if someone is sharing and it's not us
            const sharerTime = this.state.tsMap[sharer.id];
            this.Player().syncSubtitles(sharerTime);
          }
        }
      });
    });
    socket.on("REC:nameMap", (data: StringDict) => {
      this.setState({ nameMap: data });
    });
    socket.on("REC:lock", (data: string) => {
      this.setState({ roomLock: data });
    });
    socket.on("roster", (data: User[]) => {
      this.setState({ participants: data, rosterUpdateTS: Date.now() }, () => {
        this.setupRTCConnections();
      });
    });
    socket.on("chatinit", (data: ChatMessage[]) => {
      this.setState({ chat: data, scrollTimestamp: Date.now() });
    });
    socket.on("playlist", (data: PlaylistVideo[]) => {
      this.setState({ playlist: data });
    });
    socket.on(
      "signalSS",
      async (data: {
        msg: { ice: any; sdp: any };
        from: string;
        sharer: boolean;
      }) => {
        config.NODE_ENV === "development" && console.log(data);
        // Handle messages received from signaling server
        const msg = data.msg;
        const from = data.from;
        // Determine whether the message came from the sharer or the sharee
        const pc = (
          data.sharer ? this.consumerConn : this.publisherConns[from]
        ) as RTCPeerConnection;
        if (msg.ice !== undefined) {
          pc.addIceCandidate(new RTCIceCandidate(msg.ice));
        } else if (msg.sdp && msg.sdp.type === "offer") {
          // console.log('offer');
          // TODO Currently ios/Safari cannot handle this property, so remove it from the offer
          const _sdp = msg.sdp.sdp
            .split("\n")
            .filter((line: string) => {
              return line.trim() !== "a=extmap-allow-mixed";
            })
            .join("\n");
          msg.sdp.sdp = _sdp;
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          // Allow stereo audio
          answer.sdp = answer.sdp?.replace(
            "useinbandfec=1",
            "useinbandfec=1; stereo=1; maxaveragebitrate=510000",
          );
          // console.log(answer.sdp);
          // Allow multichannel audio if Chromium
          //@ts-expect-error
          const isChromium = Boolean(window.chrome);
          if (isChromium) {
            answer.sdp = answer.sdp
              ?.replace("opus/48000/2", "multiopus/48000/6")
              .replace(
                "useinbandfec=1",
                "channel_mapping=0,4,1,2,3,5; num_streams=4; coupled_streams=2;maxaveragebitrate=510000;minptime=10;useinbandfec=1",
              );
          }
          await pc.setLocalDescription(answer);
          this.sendSignalSS(from, { sdp: pc.localDescription }, !data.sharer);
        } else if (msg.sdp && msg.sdp.type === "answer") {
          pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
      },
    );
    socket.on("REC:getRoomState", this.handleRoomState);
    window.setInterval(() => {
      if (this.state.roomMedia) {
        const toSend = this.getRoomTSToSet(this.Player().getCurrentTime());
        this.socket.emit("CMD:ts", toSend);
      }
    }, 1000);
  };

  setFileSelection = (
    data: { name: string; url: string; length: number; playFn?: () => void }[],
  ) => {
    this.setState({ fileSelection: data });
  };

  setMultiSelectModal = (isMultiSelectModalOpen: boolean) => {
    this.setState({ isMultiSelectModalOpen });
  };

  resetMultiSelect = () => {
    this.setState({ isMultiSelectModalOpen: false, fileSelection: [] });
  };

  loadSettings = async () => {
    // Load settings from localstorage
    let settings = getCurrentSettings();
    this.setState({ settings });
  };

  loadYouTube = () => {
    // This code loads the IFrame Player API code asynchronously.
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.append(tag);
    window.onYouTubeIframeAPIReady = () => {
      // Note: this fails silently if the element is not available
      const ytPlayer = new window.YT.Player("leftYt", {
        events: {
          onReady: () => {
            console.log("yt onReady");
            this.YouTubeInterface = new YouTube(ytPlayer);
            this.setState({ loading: false });
            // We might have failed to play YT originally, ask for the current video again
            if (this.usingYoutube()) {
              console.log("requesting host data again after ytReady");
              this.socket.emit("CMD:askHost");
            }
          },
          onStateChange: (e) => {
            if (
              this.usingYoutube() &&
              e.data === window.YT?.PlayerState?.CUED
            ) {
              this.setState({ loading: false });
            }
            if (
              this.usingYoutube() &&
              e.data === window.YT?.PlayerState?.ENDED
            ) {
              console.log(e.data, e.target.getVideoUrl());
              this.onVideoEnded(e.target.getVideoUrl());
            }
            if (
              this.ytDebounce &&
              ((e.data === window.YT?.PlayerState?.PLAYING &&
                this.state.roomPaused) ||
                (e.data === window.YT?.PlayerState?.PAUSED &&
                  !this.state.roomPaused))
            ) {
              this.ytDebounce = false;
              if (e.data === window.YT?.PlayerState?.PLAYING) {
                this.socket.emit("CMD:play");
                this.localPlay();
              } else {
                this.socket.emit("CMD:pause");
                this.localPause();
              }
              window.setTimeout(() => (this.ytDebounce = true), 500);
            }
          },
        },
      });
    };
  };

  // Functions for managing room settings
  getInviteLink = (vanity: string) => {
    if (vanity) {
      return `${window.location.origin}/r/${vanity}`;
    }
    return `${window.location.origin}/watch${this.state.roomId}`;
  };

  handleRoomState = (data: any) => {
    this.setOwner(data.owner);
    this.setVanity(data.vanity);
    this.setPassword(data.password);
    this.setInviteLink(this.getInviteLink(data.vanity));
    this.setIsChatDisabled(data.isChatDisabled);
    this.setRoomTitle(data.roomTitle);
    this.setRoomDescription(data.roomDescription);
    this.setRoomTitleColor(data.roomTitleColor);
    this.setMediaPath(data.mediaPath);
    window.history.replaceState("", "", this.getInviteLink(data.vanity));
  };

  setOwner = (owner: string) => {
    this.setState({ owner });
  };
  setVanity = (vanity: string | undefined) => {
    this.setState({ vanity });
  };
  setPassword = (password: string | undefined) => {
    this.setState({ password });
  };
  setInviteLink = (inviteLink: string) => {
    this.setState({ inviteLink });
  };
  setRoomTitle = (roomTitle: string | undefined) => {
    this.setState({ roomTitle });
  };
  setRoomDescription = (roomDescription: string | undefined) => {
    this.setState({ roomDescription });
  };
  setRoomTitleColor = (roomTitleColor: string | undefined) => {
    this.setState({ roomTitleColor });
  };
  setMediaPath = (mediaPath: string | undefined) => {
    this.setState({ mediaPath });
  };

  setRoomLock = async (locked: boolean) => {
    this.socket.emit("CMD:lock", { locked });
  };

  haveLock = () => {
    if (!this.state.roomLock) {
      return true;
    }
    return this.context.user?.uid === this.state.roomLock;
  };

  setIsChatDisabled = (val: boolean) => this.setState({ isChatDisabled: val });

  clearChat = async () => {
    this.socket.emit("CMD:deleteChatMessages", {});
  };

  startConvert = async (_sourceUrl?: string) => {
    this.setState({
      errorMessage:
        "برای تبدیل، فایل را از گزینه «آپلود ویدیو» روی VPS ارسال کنید.",
    });
  };

  uploadMedia = (
    file: File,
    options: UploadOptions,
    onUploadProgress: (progress: number) => void,
    onMediaStatus: (media: UploadedMedia) => void,
  ): Promise<UploadedMedia> =>
    new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/media/upload");
      request.withCredentials = true;
      request.setRequestHeader("Content-Type", "application/octet-stream");
      request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
      request.setRequestHeader("X-Convert-Mp4", "true");
      request.setRequestHeader("X-Transcode-Preset", options.preset);
      request.setRequestHeader("X-Play-When", options.playWhen);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      request.onerror = () => reject(new Error("ارتباط با سرور قطع شد."));
      request.onabort = () => reject(new Error("آپلود لغو شد."));
      request.onload = async () => {
        let data: UploadedMedia & { error?: string };
        try {
          data = JSON.parse(request.responseText);
        } catch {
          reject(new Error("پاسخ نامعتبر از سرور دریافت شد."));
          return;
        }
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(data.error || "آپلود انجام نشد."));
          return;
        }
        onUploadProgress(100);
        onMediaStatus(data);
        if (options.playWhen === "playable") {
          resolve(data);
          void this.waitForMediaTarget(data.id, "playable").catch(
            (error: any) => {
              if (!this.isUnmounted) {
                this.setState({
                  errorMessage: error?.message || "تبدیل ویدیو انجام نشد.",
                });
              }
            },
          );
          return;
        }
        try {
          resolve(
            await this.waitForMediaTarget(data.id, "ready", onMediaStatus),
          );
        } catch (error) {
          reject(error);
        }
      };
      request.send(file);
    });

  waitForMediaTarget = async (
    id: string,
    target: "playable" | "ready",
    onMediaStatus?: (media: UploadedMedia) => void,
  ): Promise<UploadedMedia> => {
    for (let attempt = 0; attempt < 57_600; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
      if (this.isUnmounted) {
        throw new Error("پیگیری تبدیل متوقف شد.");
      }
      try {
        const response = await fetch(`/api/media/${encodeURIComponent(id)}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("وضعیت ویدیو دریافت نشد.");
        }
        const media = (await response.json()) as UploadedMedia;
        onMediaStatus?.(media);
        if (
          ((target === "playable" &&
            (media.status === "playable" || media.status === "ready")) ||
            (target === "ready" && media.status === "ready")) &&
          media.url
        ) {
          this.roomSetMedia(media.url);
          return media;
        }
        if (media.status === "failed") {
          const conversionError = new Error(
            media.error || "تبدیل ویدیو انجام نشد.",
          ) as Error & { fatal?: boolean };
          conversionError.fatal = true;
          throw conversionError;
        }
      } catch (error: any) {
        if (error?.fatal) {
          throw error;
        }
        if (attempt > 10) {
          throw new Error(
            error?.message || "پیگیری وضعیت تبدیل ویدیو انجام نشد.",
          );
        }
      }
    }
    throw new Error("تبدیل ویدیو بیشتر از زمان مجاز طول کشید.");
  };

  startFileShare = async (useMediaSoup: boolean) => {
    const files = await openFileSelector();
    if (!files) {
      return;
    }
    const file = files[0];
    this.Player().clearState();
    const leftVideo = this.HTMLInterface.getVideoEl();
    leftVideo.src = URL.createObjectURL(file);
    leftVideo.play();
    //@ts-expect-error
    this.localStreamToPublish = leftVideo?.captureStream();
    this.isLocalStreamAFile = true;
    if (this.localStreamToPublish) {
      this.socket.emit("CMD:joinScreenShare", {
        file: true,
        mediasoup: useMediaSoup,
      });
    }
  };

  startScreenShare = async (useMediaSoup: boolean) => {
    if (navigator.mediaDevices.getDisplayMedia) {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        //@ts-expect-error
        video: { height: 720, logicalSurface: true },
        audio: {
          autoGainControl: false,
          channelCount: 2,
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 48000,
          sampleSize: 16,
        },
      });
      this.localStreamToPublish = stream;
      this.isLocalStreamAFile = false;
      this.socket.emit("CMD:joinScreenShare", {
        file: false,
        mediasoup: useMediaSoup,
      });
    }
  };

  // Share the video to mediasoup
  publishMediasoup = async (mediasoupURL: string) => {
    const localStream = this.localStreamToPublish;
    let device: MediasoupClient.types.Device = null as any;
    let producerTransport: MediasoupClient.types.Transport = null as any;

    // =========== socket.io ==========
    const connectSocket = (mediasoupURL: string) => {
      return new Promise<void>((resolve, reject) => {
        this.mediasoupPubSocket = io(mediasoupURL, {
          transports: ["websocket"],
        });

        const socket = this.mediasoupPubSocket;
        socket?.on("connect", function () {
          console.log("PUBLISH: connected to socket.io");
          resolve();
        });
        socket?.on("error", function (err) {
          console.error("PUBLISH: socket.io ERROR:", err);
          reject(err);
        });
      });
    };

    const sendRequest = (type: string, data: any) => {
      return new Promise<any>((resolve, reject) => {
        const socket = this.mediasoupPubSocket;
        socket?.emit(type, data, (err: any, response: any) => {
          if (!err) {
            // Success response, so pass the mediasoup response to the local Room.
            resolve(response);
          } else {
            reject(err);
          }
        });
      });
    };

    async function publish() {
      // --- get transport info ---
      console.log("PUBLISH: --- createProducerTransport --");
      const params = await sendRequest("createProducerTransport", {});
      console.log("PUBLISH: transport params:", params);
      producerTransport = device.createSendTransport(params);
      console.log("PUBLISH: createSendTransport:", producerTransport);

      // --- join & start publish --
      producerTransport.on(
        "connect",
        async (
          {
            dtlsParameters,
          }: { dtlsParameters: MediasoupClient.types.DtlsParameters },
          callback: () => void,
          errback: (error: Error) => void,
        ) => {
          console.log("PUBLISH: --transport connect");
          sendRequest("connectProducerTransport", {
            dtlsParameters: dtlsParameters,
          })
            .then(callback)
            .catch(errback);
        },
      );

      producerTransport.on(
        "produce",
        async (
          {
            kind,
            rtpParameters,
          }: {
            kind: string;
            rtpParameters: MediasoupClient.types.RtpParameters;
          },
          callback: ({ id }: { id: string }) => void,
          errback: (error: Error) => void,
        ) => {
          console.log("PUBLISH: --transport produce");
          try {
            const { id } = await sendRequest("produce", {
              transportId: producerTransport.id,
              kind,
              rtpParameters,
            });
            callback({ id });
          } catch (err: any) {
            errback(err);
          }
        },
      );

      // producerTransport.on('connectionstatechange', (state: string) => {
      //   switch (state) {
      //     case 'connecting':
      //       console.log('PUBLISH: connecting');
      //       break;

      //     case 'connected':
      //       console.log('PUBLISH: connected');
      //       break;

      //     case 'failed':
      //       console.log('PUBLISH: failed');
      //       producerTransport.close();
      //       break;

      //     default:
      //       break;
      //   }
      // });

      const videoTrack = localStream?.getVideoTracks()[0];
      if (videoTrack) {
        const trackParams = { track: videoTrack };
        await producerTransport.produce(trackParams);
      }
      const audioTrack = localStream?.getAudioTracks()[0];
      if (audioTrack) {
        const trackParams = { track: audioTrack };
        await producerTransport.produce(trackParams);
      }
    }

    async function loadDevice(
      routerRtpCapabilities: MediasoupClient.types.RtpCapabilities,
    ) {
      const { Device } = await import("mediasoup-client");
      device = new Device();
      await device.load({ routerRtpCapabilities });
    }

    await connectSocket(mediasoupURL);
    // --- get capabilities --
    const data = await sendRequest("getRouterRtpCapabilities", {});
    console.log("PUBLISH: getRouterRtpCapabilities:", data);
    await loadDevice(data);
    await publish();
  };

  // Play the video from MediaSoup
  subscribeMediasoup = async (mediaSoupURL: string) => {
    let device: MediasoupClient.types.Device = null as any;
    let consumerTransport: MediasoupClient.types.Transport = null as any;
    // =========== socket.io ==========

    const connectSocket = () => {
      return new Promise<void>((resolve, reject) => {
        this.mediasoupSubSocket = io(mediaSoupURL, {
          transports: ["websocket"],
        });
        const socket = this.mediasoupSubSocket;
        socket?.on("connect", function () {
          console.log("SUBSCRIBE: connected to socket.io");
          resolve();
        });
        socket?.on("error", function (err) {
          console.error("SUBSCRIBE: socket.io ERROR:", err);
          reject(err);
        });
        socket?.on("newProducer", async function (message) {
          console.log("SUBSCRIBE: socket.io newProducer:", message);
          if (consumerTransport) {
            // start consume
            if (message.kind === "video") {
              await consumeAndResume(message.kind);
            } else if (message.kind === "audio") {
              await consumeAndResume(message.kind);
            }
          }
        });

        // socket?.on('producerClosed', function (message) {
        //   console.log('socket.io producerClosed:', message);
        //   const localId = message.localId;
        //   const remoteId = message.remoteId;
        //   const kind = message.kind;
        //   if (kind === 'video') {
        //     if (videoConsumer) {
        //       videoConsumer.close();
        //       videoConsumer = null;
        //     }
        //   } else if (kind === 'audio') {
        //     if (audioConsumer) {
        //       audioConsumer.close();
        //       audioConsumer = null;
        //     }
        //   }
        // });
      });
    };

    const sendRequest = (type: string, data: any) => {
      return new Promise<any>((resolve, reject) => {
        const socket = this.mediasoupSubSocket;
        socket?.emit(type, data, (err: Error, response: any) => {
          if (!err) {
            // Success response, so pass the mediasoup response to the local Room.
            resolve(response);
          } else {
            reject(err);
          }
        });
      });
    };

    // =========== media handling ==========
    const addRemoteTrack = (track: MediaStreamTrack) => {
      let video = this.HTMLInterface.getVideoEl();
      if (video.srcObject) {
        // Track already exists, add it
        (video.srcObject as MediaStream).addTrack(track);
      } else {
        const mediaStream = new MediaStream();
        mediaStream.addTrack(track);
        video.srcObject = mediaStream;
      }
      this.localPlay();
    };

    async function consumeAndResume(kind: string) {
      const consumer = await consume(consumerTransport, kind);
      if (consumer) {
        console.log("SUBSCRIBE: -- track exist, consumer ready. kind=" + kind);
        if (kind === "video") {
          console.log("SUBSCRIBE: -- resume kind=" + kind);
          sendRequest("resume", { kind: kind })
            .then(() => {
              console.log("SUBSCRIBE: resume OK");
              return consumer;
            })
            .catch((err) => {
              console.error("SUBSCRIBE: resume ERROR:", err);
              return consumer;
            });
        } else {
          console.log("SUBSCRIBE: -- do not resume kind=" + kind);
        }
      } else {
        console.log("SUBSCRIBE: -- no consumer yet. kind=" + kind);
        return null;
      }
    }

    async function loadDevice(
      routerRtpCapabilities: MediasoupClient.types.RtpCapabilities,
    ) {
      try {
        const { Device } = await import("mediasoup-client");
        device = new Device();
        await device.load({ routerRtpCapabilities });
      } catch (error: any) {
        if (error.name === "UnsupportedError") {
          console.error("browser not supported");
        }
      }
    }

    async function consume(
      transport: MediasoupClient.types.Transport,
      trackKind: string,
    ) {
      console.log("SUBSCRIBE: --start of consume --kind=" + trackKind);
      const { rtpCapabilities } = device;
      const data = await sendRequest("consume", {
        rtpCapabilities: rtpCapabilities,
        kind: trackKind,
      }).catch((err) => {
        console.error("SUBSCRIBE: ERROR:", err);
      });
      const { producerId, id, kind, rtpParameters } = data;

      if (producerId) {
        let codecOptions = {};
        const consumer = await transport.consume({
          id,
          producerId,
          kind,
          rtpParameters,
          //@ts-expect-error
          codecOptions,
        });

        addRemoteTrack(consumer.track);
        console.log("SUBSCRIBE: --end of consume");
        return consumer;
      } else {
        console.warn("SUBSCRIBE: ---remote producer NOT READY");
        return null;
      }
    }

    async function subscribe() {
      console.log("SUBSCRIBE: ---createConsumerTransport --");
      const params = await sendRequest("createConsumerTransport", {});
      console.log("SUBSCRIBE: transport params:", params);
      consumerTransport = device.createRecvTransport(params);
      console.log("SUBSCRIBE: createConsumerTransport:", consumerTransport);

      // --- join & start watching
      consumerTransport.on(
        "connect",
        async (
          {
            dtlsParameters,
          }: { dtlsParameters: MediasoupClient.types.DtlsParameters },
          callback: () => void,
          errback: (err: Error) => void,
        ) => {
          console.log("SUBSCRIBE: ---consumer transport connect");
          sendRequest("connectConsumerTransport", {
            dtlsParameters: dtlsParameters,
          })
            .then(callback)
            .catch(errback);
        },
      );

      // consumerTransport.on('connectionstatechange', (state: string) => {
      //   switch (state) {
      //     case 'connecting':
      //       console.log('SUBSCRIBE: connecting');
      //       break;

      //     case 'connected':
      //       console.log('SUBSCRIBE: connected');
      //       break;

      //     case 'failed':
      //       console.log('SUBSCRIBE: failed');
      //       consumerTransport.close();
      //       break;

      //     default:
      //       break;
      //   }
      // });

      await consumeAndResume("video");
      await consumeAndResume("audio");
    }

    // Clear the srcobject so we load our stream when received
    const leftVideo = this.HTMLInterface.getVideoEl();
    leftVideo.srcObject = null;
    await connectSocket();
    // --- get capabilities --
    const data = await sendRequest("getRouterRtpCapabilities", {});
    console.log("getRouterRtpCapabilities:", data);
    await loadDevice(data);
    await subscribe();
  };

  stopPublishingLocalStream = async () => {
    if (this.localStreamToPublish) {
      this.socket.emit("CMD:leaveScreenShare");
      // We don't actually need to unmute if it's a fileshare but this is fine
      this.localSetMute(false);
    }
    this.localStreamToPublish &&
      this.localStreamToPublish.getTracks().forEach((track) => {
        track.stop();
      });
    this.localStreamToPublish = undefined;
    if (this.consumerConn) {
      this.consumerConn.close();
      this.consumerConn = undefined;
    }
    Object.values(this.publisherConns).forEach((pc) => {
      pc.close();
    });
    this.publisherConns = {};
    this.isLocalStreamAFile = false;
    if (this.mediasoupPubSocket) {
      this.mediasoupPubSocket.close();
      this.mediasoupPubSocket = null;
    }
    if (this.mediasoupSubSocket) {
      this.mediasoupSubSocket.close();
      this.mediasoupSubSocket = null;
    }
  };

  setupRTCConnections = async () => {
    if (!this.playingScreenShare() && !this.playingFileShare()) {
      return;
    }
    const sharer = this.state.participants.find((p) => p.isScreenShare);
    const selfId = getOrCreateClientId();
    const localTrack = this.localStreamToPublish?.getVideoTracks()[0];
    if (localTrack && !localTrack.onended) {
      // Stop sharing if the local stream stops
      localTrack.onended = () => this.stopPublishingLocalStream();
    }
    if (this.state.roomMedia.includes("@")) {
      let prefix = "screenshare://";
      if (this.playingFileShare()) {
        prefix = "fileshare://";
      }
      const unprefixed = this.state.roomMedia.replace(prefix, "");
      const mediasoupURL = unprefixed.split("@")[1];
      if (sharer?.id === selfId && this.mediasoupPubSocket == null) {
        await this.publishMediasoup(mediasoupURL);
      }
      // If we're not sharing a file, also start watching
      // avoid duplicate watching if the socket already exists
      if (!this.isLocalStreamAFile && this.mediasoupSubSocket == null) {
        await this.subscribeMediasoup(mediasoupURL);
      }
      return;
    }

    // We're the sharer, create a connection to each other member
    if (sharer?.id === selfId) {
      // Delete and close any connections that aren't in the current member list (maybe someone disconnected)
      // This allows them to rejoin later
      const clientIds = new Set(this.state.participants.map((p) => p.id));
      Object.entries(this.publisherConns).forEach(([key, value]) => {
        if (!clientIds.has(key)) {
          value.close();
          delete this.publisherConns[key];
        }
      });

      this.state.participants.forEach((user) => {
        const id = user.id;
        if (id === selfId && this.isLocalStreamAFile) {
          // Don't set up a connection to ourselves if sharing file
          return;
        }
        if (!this.publisherConns[id]) {
          // Set up the RTCPeerConnection for sharing media to each member
          const pc = new RTCPeerConnection({ iceServers: iceServers() });
          this.publisherConns[id] = pc;
          this.localStreamToPublish?.getTracks().forEach((track) => {
            if (this.localStreamToPublish != null) {
              pc.addTrack(track, this.localStreamToPublish);
            }
          });
          pc.onicecandidate = (event) => {
            // We generated an ICE candidate, send it to peer
            if (event.candidate) {
              this.sendSignalSS(id, { ice: event.candidate }, true);
            }
          };
          pc.onnegotiationneeded = async () => {
            // Start connection for peer's video
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignalSS(id, { sdp: pc.localDescription }, true);
          };
        }
      });
    }
    // We're a watcher, establish connection to sharer
    // If screensharing, sharer also does this
    // If filesharing, sharer does not do this since we use leftVideo
    if (sharer && !this.consumerConn && !this.isLocalStreamAFile) {
      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      this.consumerConn = pc;
      pc.onicecandidate = (event) => {
        // We generated an ICE candidate, send it to sharer
        if (event.candidate) {
          this.sendSignalSS(sharer.id, { ice: event.candidate });
        }
      };
      pc.ontrack = (event: RTCTrackEvent) => {
        // Mount the stream from sharer
        // console.log(stream);
        const leftVideo = this.HTMLInterface.getVideoEl();
        if (leftVideo) {
          leftVideo.src = "";
          leftVideo.srcObject = event.streams[0];
          this.localPlay();
        }
      };
    }
  };

  startVBrowser = async (options: { size: string }) => {
    this.socket.emit("CMD:startVBrowser", { options });
  };

  stopVBrowser = async () => {
    this.socket.emit("CMD:stopVBrowser");
  };

  changeController = async (value: string | null) => {
    // console.log(data);
    this.socket.emit("CMD:changeController", value);
  };

  sendSignalSS = async (to: string, data: any, sharer?: boolean) => {
    // console.log('sendSS', to, data);
    this.socket.emit("signalSS", { to, msg: data, sharer });
  };

  usingYoutube = () => {
    return isYouTube(this.state.roomMedia);
  };

  usingNative = () => {
    // Anything that uses HTML Video (e.g. not YouTube, Vimeo, or other embedded JS player)
    return !this.usingYoutube();
  };

  hasDuration = () => {
    // Youtube, link, or magnet, etc. Has a defined runtime (not WebRTC)
    return isHttp(this.state.roomMedia) || isMagnet(this.state.roomMedia);
  };

  isManagedProgressiveHls = (source = this.state.roomMedia) => {
    try {
      const pathname = new URL(source, window.location.origin).pathname;
      return (
        pathname.startsWith("/media/") && pathname.endsWith("/master.m3u8")
      );
    } catch {
      return false;
    }
  };

  getManagedMediaId = (source = this.state.roomMedia) => {
    try {
      const pathname = new URL(source, window.location.origin).pathname;
      const match = pathname.match(/^\/media\/([^/]+)\/master\.m3u8$/);
      return match ? decodeURIComponent(match[1]) : undefined;
    } catch {
      return undefined;
    }
  };

  loadManagedMediaDuration = async (source: string) => {
    const requestGeneration = ++this.managedMediaRequestGeneration;
    const id = this.getManagedMediaId(source);
    if (!id) {
      if (source === this.state.roomMedia) {
        this.setState({ managedMediaDuration: undefined });
      }
      return;
    }
    try {
      const response = await fetch(
        `/api/media-playback/${encodeURIComponent(id)}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        return;
      }
      const media = (await response.json()) as {
        duration?: number;
      };
      const duration = Number(media.duration);
      if (
        requestGeneration === this.managedMediaRequestGeneration &&
        source === this.state.roomMedia &&
        Number.isFinite(duration) &&
        duration > 0
      ) {
        this.setState({ managedMediaDuration: duration });
      }
    } catch (error) {
      console.warn("Unable to load managed media duration:", error);
    }
  };

  playingScreenShare = () => {
    return isScreenShare(this.state.roomMedia);
  };

  playingFileShare = () => {
    return isFileShare(this.state.roomMedia);
  };

  playingVBrowser = () => {
    return isVBrowser(this.state.roomMedia);
  };

  getVBrowserPass = () => {
    return this.state.roomMedia.replace("vbrowser://", "").split("@")[0];
  };

  getVBrowserHost = () => {
    return this.state.roomMedia.replace("vbrowser://", "").split("@")[1];
  };

  isPauseDisabled = () => {
    return this.playingScreenShare() || this.playingVBrowser();
  };

  localSeek = (customTime?: number) => {
    // Jump to the leader's position, or a custom one
    let target = customTime ?? this.getLeaderTime();
    // For live this is the offset from the leading edge (negative)
    if (this.state.isLiveStream) {
      target = this.Player().getDuration() + (customTime ?? 0);
    } else {
      target = this.normalizeSeekTarget(target);
    }
    if (target >= 0 && target < Infinity) {
      console.log("syncing self to leader or custom:", target);
      this.Player().seekVideo(target);
    }
  };

  localPlay = async () => {
    if (!this.state.roomMedia) {
      return;
    }
    const canAutoplay = this.state.isAutoPlayable || (await testAutoplay());
    this.setState(
      { roomPaused: false, isAutoPlayable: canAutoplay },
      async () => {
        if (
          !this.state.isAutoPlayable ||
          (this.localStreamToPublish && !this.isLocalStreamAFile)
        ) {
          console.log("auto-muting to allow autoplay or screenshare host");
          this.localSetMute(true);
        } else {
          this.localSetMute(false);
        }
        try {
          await this.Player().playVideo();
        } catch (e: any) {
          console.warn(e, e.name);
          if (e.name === "NotSupportedError" && this.usingNative()) {
            this.setState({ loading: false, nonPlayableMedia: true });
          }
        }
      },
    );
  };

  localPause = () => {
    this.setState({ roomPaused: true }, async () => {
      this.Player().pauseVideo();
    });
  };

  localSetMute = (muted: boolean) => {
    this.Player().setMute(muted);
    this.refreshControls();
  };

  localSetVolume = (volume: number) => {
    this.Player().setVolume(volume);
    this.refreshControls();
  };

  localSubtitleModal = () => {
    // Native player uses subtitle modal.
    if (this.usingNative()) {
      this.setState({ isSubtitleModalOpen: true });
    }
  };

  roomSetPlaybackRate = (rate: number) => {
    // emit an event to the server
    this.socket.emit("CMD:playbackRate", rate);
  };

  roomSetLoop = (loop: boolean) => {
    this.socket.emit("CMD:loop", loop);
  };

  roomTogglePlay = () => {
    if (!this.haveLock()) {
      return;
    }
    if (this.isPauseDisabled()) {
      return;
    }
    const shouldPlay = this.Player().shouldPlay();
    if (shouldPlay) {
      this.socket.emit("CMD:play");
      this.localPlay();
    } else {
      this.socket.emit("CMD:pause");
      this.localPause();
    }
  };

  roomSeek = (time: number) => {
    const target = this.state.isLiveStream
      ? Math.max(time, 0)
      : this.normalizeSeekTarget(time);
    this.Player().seekVideo(target);
    const toSend = this.getRoomTSToSet(target);
    this.socket.emit("CMD:seek", toSend);
  };

  normalizeSeekTarget = (time: number) => {
    let target = Number.isFinite(time) ? Math.max(time, 0) : 0;
    if (this.isManagedProgressiveHls()) {
      const availableDuration = this.Player().getDuration();
      if (Number.isFinite(availableDuration) && availableDuration > 0) {
        target = Math.min(target, Math.max(0, availableDuration - 0.25));
      }
    }
    return target;
  };

  getRoomTSToSet = (time: number) => {
    let target = time;
    // In live case, can't just send video time because clients may have different durations
    // Take the passed time and compute the offset from the end time (negative)
    // Each client should use this value to compute the time to set when starting playback
    if (this.state.isLiveStream) {
      target = time - this.Player().getDuration();
    }
    // Otherwise just return the time
    return target;
  };

  clearFullscreenControlsTimer = () => {
    this.fullscreenControlsTimerGeneration += 1;
    if (this.fullscreenControlsTimer !== undefined) {
      window.clearTimeout(this.fullscreenControlsTimer);
      this.fullscreenControlsTimer = undefined;
    }
  };

  scheduleFullscreenControlsHide = () => {
    this.clearFullscreenControlsTimer();
    if (!this.state.fullScreen) {
      return;
    }
    const generation = this.fullscreenControlsTimerGeneration;
    this.fullscreenControlsTimer = window.setTimeout(() => {
      if (generation !== this.fullscreenControlsTimerGeneration) {
        return;
      }
      this.fullscreenControlsTimer = undefined;
      this.setState({ fullscreenControlsVisible: false });
    }, 5000);
  };

  showFullscreenControls = () => {
    if (!this.state.fullScreen) {
      return;
    }
    this.clearFullscreenControlsTimer();
    this.setState(
      { fullscreenControlsVisible: true },
      this.scheduleFullscreenControlsHide,
    );
  };

  clearFullscreenMessageTimer = () => {
    if (this.fullscreenMessageTimer !== undefined) {
      window.clearTimeout(this.fullscreenMessageTimer);
      this.fullscreenMessageTimer = undefined;
    }
  };

  showFullscreenMessage = (message: ChatMessage) => {
    this.clearFullscreenMessageTimer();
    this.setState({ fullscreenChatMessage: message });
    this.fullscreenMessageTimer = window.setTimeout(() => {
      this.fullscreenMessageTimer = undefined;
      this.setState({ fullscreenChatMessage: null });
    }, 3000);
  };

  handleVideoInteraction = () => {
    if (!this.state.fullScreen) {
      return;
    }
    if (this.state.fullscreenControlsVisible) {
      this.clearFullscreenControlsTimer();
      this.setState({ fullscreenControlsVisible: false });
    } else {
      this.showFullscreenControls();
    }
  };

  syncVisualViewport = () => {
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const root = document.documentElement;
    root.style.setProperty("--watch-viewport-width", `${width}px`);
    root.style.setProperty("--watch-viewport-height", `${height}px`);
    root.style.setProperty("--watch-viewport-left", `${left}px`);
    root.style.setProperty("--watch-viewport-top", `${top}px`);
  };

  toggleFullscreenChat = () => {
    this.setState(
      (state) => ({
        fullscreenChatOpen: !state.fullscreenChatOpen,
        fullscreenChatUnread: state.fullscreenChatOpen
          ? state.fullscreenChatUnread
          : false,
      }),
      () => {
        if (this.state.fullscreenChatOpen) {
          this.clearFullscreenControlsTimer();
          this.setState({ fullscreenControlsVisible: false });
          setTimeout(() => this.chatRef.current?.scrollToBottom(), 100);
        } else {
          this.showFullscreenControls();
        }
      },
    );
  };

  handleChatButtonPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const originX = this.state.fullscreenChatButtonOffset.x;
    const originY = this.state.fullscreenChatButtonOffset.y;
    this.fullscreenChatDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY,
      minX: originX + 8 - rect.left,
      maxX: originX + window.innerWidth - 8 - rect.right,
      minY: originY + 8 - rect.top,
      maxY: originY + window.innerHeight - 8 - rect.bottom,
      moved: false,
    };
  };

  handleChatButtonPointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = this.fullscreenChatDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    drag.moved = drag.moved || Math.hypot(deltaX, deltaY) > 5;
    this.setState({
      fullscreenChatButtonOffset: {
        x: Math.min(drag.maxX, Math.max(drag.minX, drag.originX + deltaX)),
        y: Math.min(drag.maxY, Math.max(drag.minY, drag.originY + deltaY)),
      },
    });
  };

  handleChatButtonPointerUp = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = this.fullscreenChatDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    this.fullscreenChatDrag = undefined;
    if (!drag.moved) {
      this.toggleFullscreenChat();
    }
  };

  handleChatPanelPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const panel = event.currentTarget.closest(
      `.${styles.fullscreenChatPanel}`,
    ) as HTMLElement | null;
    if (!panel) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    const originX = this.state.fullscreenChatPanelOffset.x;
    const originY = this.state.fullscreenChatPanelOffset.y;
    this.fullscreenChatPanelDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY,
      minX: originX + 8 - rect.left,
      maxX: originX + window.innerWidth - 8 - rect.right,
      minY: originY + 8 - rect.top,
      maxY: originY + window.innerHeight - 8 - rect.bottom,
    };
  };

  handleChatPanelPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = this.fullscreenChatPanelDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    this.setState({
      fullscreenChatPanelOffset: {
        x: Math.min(drag.maxX, Math.max(drag.minX, drag.originX + deltaX)),
        y: Math.min(drag.maxY, Math.max(drag.minY, drag.originY + deltaY)),
      },
    });
  };

  handleChatPanelPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (this.fullscreenChatPanelDrag?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      this.fullscreenChatPanelDrag = undefined;
    }
  };

  onFullScreenChange = () => {
    const fullScreen = Boolean(document.fullscreenElement);
    this.setState(
      {
        fullScreen,
        fullscreenChatOpen: false,
        fullscreenControlsVisible: fullScreen,
        fullscreenChatMessage: null,
        fullscreenChatUnread: false,
        fullscreenChatPanelOffset: { x: 0, y: 0 },
      },
      () => {
        this.syncFullscreenBodyClass(fullScreen);
        if (fullScreen) {
          this.scheduleFullscreenControlsHide();
        } else {
          this.clearFullscreenControlsTimer();
          this.clearFullscreenMessageTimer();
        }
        setTimeout(() => this.chatRef.current?.scrollToBottom(), 100);
      },
    );
  };

  syncFullscreenBodyClass = (fullScreen: boolean) => {
    document.documentElement.classList.toggle("watch-fullscreen", fullScreen);
    document.body.classList.toggle("watch-fullscreen", fullScreen);
  };

  onKeydown = (e: any) => {
    if (!document.activeElement || document.activeElement.tagName === "BODY") {
      if (e.key === " ") {
        e.preventDefault();
        this.roomTogglePlay();
      } else if (e.key === "ArrowRight") {
        this.roomSeek(this.Player().getCurrentTime() + 10);
      } else if (e.key === "ArrowLeft") {
        this.roomSeek(this.Player().getCurrentTime() - 10);
      } else if (e.key === "t") {
        this.localFullScreen(false);
      } else if (e.key === "f") {
        this.localFullScreen(true);
      } else if (e.key === "m") {
        this.localToggleMute();
      }
    }
  };

  setCustomFullscreen = (fullScreen: boolean) => {
    this.setState(
      {
        fullScreen,
        fullscreenChatOpen: false,
        fullscreenControlsVisible: fullScreen,
        fullscreenChatMessage: null,
        fullscreenChatUnread: false,
        fullscreenChatPanelOffset: { x: 0, y: 0 },
      },
      () => {
        this.syncFullscreenBodyClass(fullScreen);
        if (fullScreen) {
          this.scheduleFullscreenControlsHide();
        } else {
          this.clearFullscreenControlsTimer();
          this.clearFullscreenMessageTimer();
        }
        setTimeout(() => this.chatRef.current?.scrollToBottom(), 100);
      },
    );
  };

  localFullScreen = async (requestNativeFullscreen: boolean) => {
    const container =
      document.getElementById("watch-room-layout") ?? document.body;

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } finally {
        this.setCustomFullscreen(false);
      }
      return;
    }

    if (this.state.fullScreen) {
      this.setCustomFullscreen(false);
      return;
    }

    if (requestNativeFullscreen && container.requestFullscreen) {
      try {
        await container.requestFullscreen();
        return;
      } catch {
        // Use the fixed cinema surface when fullscreen is unavailable/rejected.
      }
    }

    this.setCustomFullscreen(true);
  };

  localToggleMute = () => {
    this.localSetMute(!this.Player().isMuted());
  };

  roomSetMedia = (value: string) => {
    this.socket.emit("CMD:host", value);
  };

  roomPlaylistPlay = (index: number) => {
    this.roomSetMedia(this.state.playlist[index]?.url);
    this.roomPlaylistDelete(index);
  };

  roomPlaylistAdd = (value: string) => {
    this.socket.emit("CMD:playlistAdd", value);
  };

  roomPlaylistMove = (index: number, toIndex: number) => {
    this.socket.emit("CMD:playlistMove", { index, toIndex });
  };

  roomPlaylistDelete = (index: number) => {
    this.socket.emit("CMD:playlistDelete", index);
  };

  updateName = (name: string) => {
    this.setState({ myName: name });
    this.socket.emit("CMD:name", name);
  };

  getMediaDisplayName = (input?: string) => {
    if (!input) {
      return "";
    }
    // Show the whole URL for youtube
    if (this.usingYoutube()) {
      return input;
    }
    if (input.startsWith("screenshare://")) {
      const sharer = this.state.participants.find((user) => user.isScreenShare);
      return this.state.nameMap[sharer?.id ?? ""] + "'s screen";
    }
    if (input.startsWith("fileshare://")) {
      const sharer = this.state.participants.find((user) => user.isScreenShare);
      return this.state.nameMap[sharer?.id ?? ""] + "'s file";
    }
    if (input.startsWith("vbrowser://")) {
      return "Virtual Browser" + (this.state.isVBrowserLarge ? "+" : "");
    }
    if (isMagnet(input)) {
      const magnetParsed = new URLSearchParams(input);
      const index = magnetParsed.get("fileIndex");
      return magnetParsed.get("dn") + (index != null ? ` (file ${index})` : "");
    }
    if (input.includes("/stream?torrent=magnet")) {
      const search = new URL(input).search;
      const searchParsed = new URLSearchParams(search);
      const magnetUrl = searchParsed.get("torrent") ?? "";
      const magnetParsed = new URLSearchParams(magnetUrl);
      const index = searchParsed.get("fileIndex");
      return (
        (magnetParsed.get("dn") ?? searchParsed.get("dn")) +
        (index != null ? ` (file ${index})` : "")
      );
    }
    if (input.includes("/proxy")) {
      const urlParsed = new URLSearchParams(input);
      const displayName = urlParsed.get("displayName");
      if (displayName) {
        return displayName;
      }
    }
    return input;
  };

  setLoadingFalse = () => {
    this.setState({ loading: false });
  };

  getLeaderTime = () => {
    const timestamps = Object.values(this.state.tsMap).filter((value) =>
      Number.isFinite(value),
    );
    if (!timestamps.length) {
      return this.Player().getCurrentTime();
    }
    if (this.state.participants.length > 2) {
      return calculateMedian(timestamps);
    }
    return Math.max(...timestamps);
  };

  onVideoEnded = (url: string) => {
    this.localPause();
    // check if looping is on, if so set time back to 0 and restart
    if (this.state.roomLoop) {
      this.localSeek(0);
      this.localPlay();
      return;
    }
    if (this.state.playlist.length) {
      // Pass the url of the video at the time this video was started
      this.socket.emit("CMD:playlistNext", url);
      return;
    }
    // Play next fileIndex
    const re = /&fileIndex=(\d+)$/;
    const match = re.exec(this.state.roomMedia);
    if (match) {
      const fileIndex = match[1];
      const nextNum = Number(fileIndex) + 1;
      const nextUrl = this.state.roomMedia.replace(
        /&fileIndex=(\d+)$/,
        `&fileIndex=${nextNum}`,
      );
      this.roomSetMedia(nextUrl);
    }
  };

  refreshControls = () => {
    this.setState({ controlsTimestamp: Date.now() });
  };

  setSettingsModalOpen = (settingsModalOpen: boolean) => {
    this.setState({ settingsModalOpen });
  };

  render() {
    const playlist = this.state.playlist;
    const controls = (
      <Controls
        key={this.state.controlsTimestamp}
        video={this.state.roomMedia}
        paused={this.state.roomPaused}
        roomPlaybackRate={this.state.roomPlaybackRate}
        isLiveStream={this.state.isLiveStream}
        muted={this.Player().isMuted()}
        volume={this.Player().getVolume()}
        subtitled={this.Player().isSubtitled()}
        currentTime={this.Player().getCurrentTime()}
        duration={
          this.state.managedMediaDuration ?? this.Player().getDuration()
        }
        disabled={!this.haveLock()}
        leaderTime={this.hasDuration() ? this.getLeaderTime() : undefined}
        isPauseDisabled={this.isPauseDisabled()}
        playbackRate={this.Player().getPlaybackRate()}
        isYouTube={this.usingYoutube()}
        timeRanges={this.Player().getTimeRanges()}
        loop={this.state.roomLoop}
        roomSetLoop={this.roomSetLoop}
        roomTogglePlay={this.roomTogglePlay}
        roomSeek={this.roomSeek}
        roomSetPlaybackRate={this.roomSetPlaybackRate}
        localFullScreen={this.localFullScreen}
        localToggleMute={this.localToggleMute}
        localSubtitleModal={this.localSubtitleModal}
        localSetVolume={this.localSetVolume}
        localSeek={this.localSeek}
        localSetSubtitleMode={this.Player().setSubtitleMode}
        roomPlaylistPlay={this.roomPlaylistPlay}
        playlist={this.state.playlist}
        fullscreen={this.state.fullScreen}
      />
    );
    return (
      <React.Fragment>
        {this.state.isMultiSelectModalOpen && (
          <MultiStreamModal
            streams={this.state.fileSelection}
            setMedia={this.roomSetMedia}
            resetMultiSelect={this.resetMultiSelect}
            startConvert={this.startConvert}
          />
        )}
        {this.state.isFileShareModalOpen && (
          <FileShareModal
            closeModal={() => this.setState({ isFileShareModalOpen: false })}
            uploadMedia={this.uploadMedia}
          />
        )}
        {this.state.isSubtitleModalOpen && (
          <SubtitleModal
            closeModal={() => this.setState({ isSubtitleModalOpen: false })}
            socket={this.socket}
            roomSubtitle={this.state.roomSubtitle}
            roomMedia={this.state.roomMedia}
            haveLock={this.haveLock}
            getMediaDisplayName={this.getMediaDisplayName}
            setSubtitleMode={this.Player().setSubtitleMode}
            getSubtitleMode={this.Player().getSubtitleMode}
          />
        )}
        {this.state.state === "starting" && (
          <Overlay className={styles.flexCenter}>
            <Title order={2}>{t("loading")}</Title>
          </Overlay>
        )}
        {this.state.overlayMsg && <ErrorModal error={this.state.overlayMsg} />}
        {this.state.isErrorAuth && <PasswordModal roomId={this.state.roomId} />}
        <SettingsModal
          modalOpen={this.state.settingsModalOpen}
          setModalOpen={this.setSettingsModalOpen}
          roomLock={this.state.roomLock}
          setRoomLock={this.setRoomLock}
          socket={this.socket}
          roomId={this.state.roomId}
          isChatDisabled={this.state.isChatDisabled}
          setIsChatDisabled={this.setIsChatDisabled}
          owner={this.state.owner}
          setOwner={this.setOwner}
          vanity={this.state.vanity}
          setVanity={this.setVanity}
          inviteLink={this.state.inviteLink}
          password={this.state.password}
          setPassword={this.setPassword}
          clearChat={this.clearChat}
          roomTitle={this.state.roomTitle}
          setRoomTitle={this.setRoomTitle}
          roomDescription={this.state.roomDescription}
          setRoomDescription={this.setRoomDescription}
          roomTitleColor={this.state.roomTitleColor}
          setRoomTitleColor={this.setRoomTitleColor}
          mediaPath={this.state.mediaPath}
          setMediaPath={this.setMediaPath}
        />
        {this.state.errorMessage && (
          <Alert
            title={t("error")}
            color="red"
            style={{
              position: "fixed",
              bottom: "10px",
              right: "10px",
              zIndex: 1000,
            }}
          >
            {this.state.errorMessage}
          </Alert>
        )}
        {this.state.successMessage && (
          <Alert
            title={t("success")}
            color="green"
            style={{
              position: "fixed",
              bottom: "10px",
              right: "10px",
              zIndex: 1000,
            }}
          >
            {this.state.successMessage}
          </Alert>
        )}
        {this.state.warningMessage && (
          <Alert
            color="yellow"
            // header={this.state.warningMessage}
            style={{
              position: "fixed",
              top: "10px",
              left: "50%",
              transform: "translate(-50%, 0)",
              zIndex: 1000,
            }}
          >
            {this.state.warningMessage}
          </Alert>
        )}
        {!this.state.fullScreen && (
          <TopBar
            roomTitle={
              this.state.roomTitle || this.context.siteSettings.defaultRoomName
            }
            roomDescription={this.state.roomDescription}
            roomTitleColor={this.state.roomTitleColor}
          />
        )}
        {
          <div
            id="watch-room-layout"
            className={`${styles.watchPage} ${styles.roomLayout} ${
              this.state.fullScreen ? styles.fullscreenLayout : ""
            }`}
          >
            <div
              className={
                (this.state.fullScreen
                  ? styles.fullHeightColumnFullscreen
                  : styles.fullHeightColumn) +
                " " +
                styles.leftColumn +
                " " +
                styles.mediaColumn
              }
            >
              <div className={styles.mediaPanel}>
                {!this.state.fullScreen && (
                  <React.Fragment>
                    <div className={styles.sourceRow}>
                      <ComboBox
                        roomSetMedia={this.roomSetMedia}
                        playlistAdd={this.roomPlaylistAdd}
                        roomMedia={this.state.roomMedia}
                        getMediaDisplayName={this.getMediaDisplayName}
                        mediaPath={this.state.mediaPath}
                        disabled={!this.haveLock()}
                      />
                    </div>
                    <div className={styles.actionRow}>
                      {this.localStreamToPublish && (
                        <Button
                          color="red"
                          onClick={this.stopPublishingLocalStream}
                          leftSection={<IconX />}
                        >
                          {t("stopShare")}
                        </Button>
                      )}
                      {!this.localStreamToPublish && (
                        <Button
                          className={styles.shareButton}
                          disabled={!this.haveLock()}
                          onClick={() => {
                            this.setState({ isFileShareModalOpen: true });
                          }}
                          leftSection={<IconFile />}
                        >
                          آپلود ویدیو
                        </Button>
                      )}
                      {isCompactViewport() && (
                        <Button
                          className={styles.shareButton}
                          onClick={() => {
                            this.setState((state) => ({
                              showChatColumn: !state.showChatColumn,
                            }));
                          }}
                          leftSection={<IconMessageCircle size={17} />}
                        >
                          {this.state.showChatColumn
                            ? t("closeChat")
                            : t("conversation")}
                        </Button>
                      )}
                      {this.state.uploadController && (
                        <Button
                          color="red"
                          onClick={() => {
                            this.state.uploadController?.abort();
                          }}
                          leftSection={<IconX />}
                        >
                          {t("stopConvert")}
                        </Button>
                      )}
                      {false && (
                        <SearchComponent
                          setMedia={this.roomSetMedia}
                          playlistAdd={this.roomPlaylistAdd}
                          type={"youtube"}
                          setShowMultiSelect={this.setMultiSelectModal}
                          setFileSelection={this.setFileSelection}
                          disabled={!this.haveLock()}
                        />
                      )}
                      {Boolean(this.context.streamPath) && (
                        <SearchComponent
                          setMedia={this.roomSetMedia}
                          playlistAdd={this.roomPlaylistAdd}
                          type={"stream"}
                          setShowMultiSelect={this.setMultiSelectModal}
                          setFileSelection={this.setFileSelection}
                          disabled={!this.haveLock()}
                        />
                      )}
                      <Menu>
                        <Menu.Target>
                          <Button
                            color="grey"
                            leftSection={<IconList />}
                            rightSection={
                              <Badge circle>{playlist.length}</Badge>
                            }
                            className={styles.shareButton}
                          >
                            {t("playlist")}
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown
                          style={{
                            overflowY:
                              playlist.length > 0 ? "scroll" : undefined,
                            maxHeight: 400,
                            maxWidth: isCompactViewport() ? 400 : 600,
                          }}
                        >
                          {playlist.length === 0 && (
                            <Menu.Item disabled>فهرست پخش خالی است.</Menu.Item>
                          )}
                          {playlist.map(
                            (item: PlaylistVideo, index: number) => {
                              if (Boolean(item.img)) {
                                item.type = "youtube";
                              }
                              return (
                                <Menu.Item key={index}>
                                  <ChatVideoCard
                                    video={item}
                                    index={index}
                                    controls
                                    onPlay={this.roomPlaylistPlay}
                                    onPlayNext={(index) => {
                                      this.roomPlaylistMove(index, 0);
                                    }}
                                    onRemove={(index) => {
                                      this.roomPlaylistDelete(index);
                                    }}
                                    disabled={!this.haveLock()}
                                  />
                                </Menu.Item>
                              );
                            },
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </div>
                  </React.Fragment>
                )}
                <div
                  className={styles.playerStage}
                  style={{ flexGrow: 1, position: "relative" }}
                >
                  <div className={styles.playerContainer}>
                    {!this.state.isAutoPlayable && this.state.roomMedia && (
                      <Overlay className={styles.flexCenter}>
                        <Button
                          onClick={() => {
                            this.setState({ isAutoPlayable: true });
                            this.localSetMute(false);
                            this.localSetVolume(1);
                          }}
                          leftSection={<IconVolume />}
                          size="xl"
                        >
                          فعال‌سازی صدا
                        </Button>
                      </Overlay>
                    )}
                    {(this.state.loading ||
                      !this.state.roomMedia ||
                      this.state.nonPlayableMedia) &&
                      !this.state.isLiveStream && (
                        <div
                          id="loader"
                          className={`${styles.videoContent} ${styles.flexCenter}`}
                        >
                          {this.state.loading && (
                            <div
                              className={styles.flexCenter}
                              style={{
                                flexDirection: "column",
                              }}
                            >
                              <Loader />
                              <div>
                                {this.playingVBrowser()
                                  ? "در حال راه‌اندازی مرورگر مجازی؛ ممکن است یک دقیقه طول بکشد."
                                  : ""}
                              </div>
                            </div>
                          )}
                          {!this.state.loading && !this.state.roomMedia && (
                            <Alert color="yellow" title={t("nothingPlaying")}>
                              {t("chooseSomething")}
                            </Alert>
                          )}
                          {!this.state.loading &&
                            this.state.nonPlayableMedia && (
                              <Alert
                                color="red"
                                title="این فایل رسانه‌ای قابل پخش نیست."
                              >
                                اگر می‌خواهید یک وب‌سایت را باز کنید، مرورگر
                                مجازی را امتحان کنید.
                              </Alert>
                            )}
                        </div>
                      )}
                    <iframe
                      style={{
                        display:
                          this.usingYoutube() && !this.state.loading
                            ? "block"
                            : "none",
                      }}
                      title="YouTube"
                      id="leftYt"
                      className={styles.videoContent}
                      allowFullScreen
                      frameBorder="0"
                      allow="autoplay; encrypted-media"
                      src="https://www.youtube.com/embed/?enablejsapi=1&controls=0&rel=0"
                    />
                    {this.playingVBrowser() &&
                    this.getVBrowserPass() &&
                    this.getVBrowserHost() ? (
                      <VBrowser
                        username={clientId}
                        password={this.getVBrowserPass()}
                        hostname={this.getVBrowserHost()}
                        controlling={this.state.controller === clientId}
                        resolution={this.state.vBrowserResolution}
                        quality={this.state.vBrowserQuality}
                        doPlay={this.localPlay}
                        setResolution={(data: string) =>
                          this.setState({ vBrowserResolution: data })
                        }
                        setQuality={(data: string) => {
                          this.setState({ vBrowserQuality: data });
                        }}
                        isMobile={isCompactViewport()}
                      />
                    ) : (
                      <video
                        className={styles.videoElement}
                        style={{
                          display:
                            (this.usingNative() && !this.state.loading) ||
                            this.state.fullScreen
                              ? "block"
                              : "none",
                        }}
                        id="leftVideo"
                        onEnded={(e) => this.onVideoEnded(e.currentTarget.src)}
                        playsInline
                      ></video>
                    )}
                    {this.state.fullScreen && this.state.roomMedia && (
                      <div
                        className={styles.fullscreenTapSurface}
                        onPointerUp={this.handleVideoInteraction}
                        aria-hidden="true"
                      />
                    )}
                    {this.state.fullScreen && this.state.roomMedia && (
                      <div
                        className={`${styles.fullscreenControls} ${
                          this.state.fullscreenControlsVisible
                            ? ""
                            : styles.fullscreenControlsHidden
                        }`}
                      >
                        {controls}
                      </div>
                    )}
                    {this.state.fullScreen &&
                      this.state.fullscreenChatMessage && (
                        <div
                          className={styles.fullscreenMessageToast}
                          role="status"
                          aria-live="polite"
                        >
                          <span className={styles.fullscreenMessageAuthor}>
                            {this.state.nameMap[
                              this.state.fullscreenChatMessage.id
                            ] || "کاربر"}
                          </span>
                          <span className={styles.fullscreenMessageText}>
                            {this.state.fullscreenChatMessage.msg}
                          </span>
                        </div>
                      )}
                    {Boolean(this.state.total) && (
                      <div
                        style={{
                          color: softWhite,
                          fontWeight: 400,
                          fontSize: 10,
                          lineHeight: "8px",
                          position: "absolute",
                          bottom: 0,
                          right: 0,
                          zIndex: 1,
                        }}
                      >
                        {Math.min(
                          (this.state.downloaded / this.state.total) * 100,
                          100,
                        ).toFixed(2) +
                          "% - " +
                          formatSpeed(this.state.speed) +
                          " - " +
                          this.state.connections +
                          " connections"}
                      </div>
                    )}
                  </div>
                </div>
                {!this.state.fullScreen && this.state.roomMedia && controls}
                {!isCompactViewport() && (
                  <div className={styles.expandButton}>
                    <ActionIcon
                      onClick={() => {
                        const newVal = !this.state.showChatColumn;
                        this.setState({
                          showChatColumn: newVal,
                        });
                        window.localStorage.setItem(
                          "watchparty-showchatcolumn",
                          Number(newVal).toString(),
                        );
                      }}
                    >
                      {this.state.showChatColumn ? (
                        <IconChevronRight size={16} />
                      ) : (
                        <IconChevronLeft size={16} />
                      )}
                    </ActionIcon>
                  </div>
                )}
              </div>
            </div>
            {!this.state.fullScreen && (
              <div
                style={{
                  display:
                    this.state.showChatColumn || !isCompactViewport()
                      ? "flex"
                      : "none",
                  flexDirection: "column",
                  position: "relative",
                  flex: isCompactViewport()
                    ? "0 0 auto"
                    : this.state.showChatColumn
                      ? "0 0 390px"
                      : "0 0 0px",
                  width: this.state.showChatColumn ? 400 : 0,
                  maxWidth: 400,
                  overflow: "hidden",
                  gap: "4px",
                }}
                className={`${styles.fullHeightColumn} ${styles.rightColumn} ${styles.chatColumn}`}
              >
                <div className={styles.roomActions}>
                  <Button
                    color="grey"
                    title="Settings"
                    fullWidth
                    onClick={() => {
                      this.setSettingsModalOpen(true);
                    }}
                    leftSection={<IconSettings />}
                  >
                    {t("settings")}
                  </Button>
                </div>
                <Chat
                  chat={this.state.chat}
                  nameMap={this.state.nameMap}
                  socket={this.socket}
                  scrollTimestamp={this.state.scrollTimestamp}
                  getMediaDisplayName={this.getMediaDisplayName}
                  isChatDisabled={this.state.isChatDisabled}
                  owner={this.state.owner}
                  ref={this.chatRef}
                  hide={!this.state.showChatColumn}
                />
              </div>
            )}
            {this.state.fullScreen && this.state.fullscreenChatOpen && (
              <div
                className={styles.fullscreenChatOverlay}
                role="dialog"
                aria-label={t("conversation")}
              >
                <div
                  className={styles.fullscreenChatPanel}
                  style={{
                    transform: `translate3d(${this.state.fullscreenChatPanelOffset.x}px, ${this.state.fullscreenChatPanelOffset.y}px, 0)`,
                  }}
                >
                  <div className={styles.fullscreenChatHeader}>
                    <div
                      className={styles.fullscreenChatTitle}
                      onPointerDown={this.handleChatPanelPointerDown}
                      onPointerMove={this.handleChatPanelPointerMove}
                      onPointerUp={this.handleChatPanelPointerUp}
                      onPointerCancel={() => {
                        this.fullscreenChatPanelDrag = undefined;
                      }}
                    >
                      <IconMessageCircle size={18} />
                      <span>{t("conversation")}</span>
                      <span className={styles.fullscreenChatMeta}>
                        {this.state.participants.length}
                      </span>
                    </div>
                    <ActionIcon
                      variant="subtle"
                      aria-label={t("closeChat")}
                      onClick={this.toggleFullscreenChat}
                    >
                      <IconX size={18} />
                    </ActionIcon>
                  </div>
                  <Chat
                    chat={this.state.chat}
                    nameMap={this.state.nameMap}
                    socket={this.socket}
                    scrollTimestamp={this.state.scrollTimestamp}
                    getMediaDisplayName={this.getMediaDisplayName}
                    isChatDisabled={this.state.isChatDisabled}
                    owner={this.state.owner}
                    ref={this.chatRef}
                    hide={false}
                    fullscreen
                    className={styles.fullscreenChatInner}
                  />
                </div>
              </div>
            )}
            {this.state.fullScreen && (
              <>
                <ActionIcon
                  className={`${styles.fullscreenExitButton} ${
                    this.state.fullscreenControlsVisible
                      ? ""
                      : styles.fullscreenChromeHidden
                  }`}
                  variant="filled"
                  size="lg"
                  aria-hidden={!this.state.fullscreenControlsVisible}
                  tabIndex={this.state.fullscreenControlsVisible ? 0 : -1}
                  aria-label="خروج از تمام صفحه"
                  title="خروج از تمام صفحه"
                  onClick={() => this.localFullScreen(true)}
                >
                  <IconArrowsMinimize size={20} />
                </ActionIcon>
                <button
                  type="button"
                  className={`${styles.floatingChatButton} ${
                    this.state.fullscreenChatUnread
                      ? styles.floatingChatButtonUnread
                      : ""
                  }`}
                  style={{
                    transform: `translate3d(${this.state.fullscreenChatButtonOffset.x}px, ${this.state.fullscreenChatButtonOffset.y}px, 0)`,
                  }}
                  aria-label={
                    this.state.fullscreenChatOpen
                      ? t("closeChat")
                      : t("openChat")
                  }
                  title={t("conversation")}
                  onPointerDown={this.handleChatButtonPointerDown}
                  onPointerMove={this.handleChatButtonPointerMove}
                  onPointerUp={this.handleChatButtonPointerUp}
                  onPointerCancel={() => {
                    this.fullscreenChatDrag = undefined;
                  }}
                >
                  <IconMessageCircle size={21} />
                  {this.state.fullscreenChatUnread && (
                    <span className={styles.floatingChatUnreadDot} />
                  )}
                </button>
              </>
            )}
          </div>
        }
      </React.Fragment>
    );
  }
}
