import React, { useEffect, useMemo, useState } from "react";
import { Badge, Menu, Progress } from "@mantine/core";
import {
  IconBadgeCc,
  IconCheck,
  IconMaximize,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
  IconRefresh,
  IconRepeat,
  IconTheater,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { formatTimestamp } from "../../utils/utils";
import styles from "./Controls.module.css";

interface ControlsProps {
  duration: number;
  video: string;
  paused: boolean;
  muted: boolean;
  volume: number;
  subtitled: boolean;
  currentTime: number;
  disabled?: boolean;
  leaderTime?: number;
  isPauseDisabled?: boolean;
  playbackRate: number;
  roomPlaybackRate: number;
  isYouTube: boolean;
  isLiveStream: boolean;
  timeRanges: { start: number; end: number }[];
  loop: boolean;
  roomTogglePlay: () => void;
  roomSeek: (time: number) => void;
  roomSetPlaybackRate: (rate: number) => void;
  roomSetLoop: (loop: boolean) => void;
  localFullScreen: (fs: boolean) => void;
  localToggleMute: () => void;
  localSubtitleModal: () => void;
  localSeek: () => void;
  localSetVolume: (volume: number) => void;
  localSetSubtitleMode: (mode: TextTrackMode, lang?: string) => void;
  roomPlaylistPlay: (index: number) => void;
  playlist: PlaylistVideo[];
  fullscreen?: boolean;
}

export const Controls = (props: ControlsProps) => {
  const [hoverState, setHoverState] = useState({
    hoverTimestamp: 0,
    hoverPos: 0,
  });
  const [showTimestamp, setShowTimestamp] = useState(false);
  const [volumeValue, setVolumeValue] = useState(props.volume);

  useEffect(() => {
    setVolumeValue(props.volume);
  }, [props.volume]);

  const getEnd = () =>
    Number.isFinite(props.duration) && props.duration > 0
      ? props.duration
      : Math.max(props.currentTime, 0);
  const getLength = () => getEnd();
  const getCurrent = () =>
    Number.isFinite(props.currentTime) ? Math.max(props.currentTime, 0) : 0;
  const clampPercent = (value: number) =>
    Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const getPercent = () =>
    getLength() > 0 ? clampPercent((getCurrent() / getLength()) * 100) : 0;
  const zeroTime = useMemo(
    () => Math.floor(Date.now() / 1000) - props.duration,
    [props.video, Boolean(props.duration)],
  );

  const {
    roomTogglePlay,
    roomSeek,
    localFullScreen,
    localToggleMute,
    localSubtitleModal,
    localSeek,
    leaderTime,
    isPauseDisabled,
    disabled,
    subtitled,
    paused,
    muted,
    isLiveStream,
    playlist,
    roomPlaylistPlay,
    timeRanges,
    roomSetPlaybackRate,
    roomPlaybackRate,
  } = props;

  const syncDelta =
    !isLiveStream && Number.isFinite(leaderTime)
      ? Number(leaderTime) - getCurrent()
      : 0;
  const isOutOfSync = Math.abs(syncDelta) > 0.35;
  const buffers = timeRanges.map(({ start, end }) => {
    const buffStartPct = clampPercent((start / getLength()) * 100);
    const buffEndPct = clampPercent((end / getLength()) * 100);
    const buffLengthPct = Math.max(0, buffEndPct - buffStartPct);
    return (
      <div
        key={start}
        className={styles.buffer}
        style={{ left: `${buffStartPct}%`, width: `${buffLengthPct}%` }}
      />
    );
  });

  const updateHover = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    setHoverState({
      hoverTimestamp: percent * getLength(),
      hoverPos: percent,
    });
  };

  const seekFromPointer = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !Number.isFinite(getLength()) || getLength() <= 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    roomSeek(getLength() * percent);
  };

  const actionClassName = (secondaryClass?: string) =>
    [styles.actionButton, secondaryClass].filter(Boolean).join(" ");

  return (
    <div
      className={`${styles.controls} ${props.fullscreen ? styles.fullscreen : ""}`}
      dir="ltr"
    >
      <div className={styles.timelineRow}>
        <span className={styles.time}>
          {formatTimestamp(getCurrent(), isLiveStream ? zeroTime : undefined)}
        </span>
        <Progress.Root
          className={styles.timeline}
          radius="xl"
          onClick={seekFromPointer}
          onMouseEnter={() => setShowTimestamp(true)}
          onMouseLeave={() => setShowTimestamp(false)}
          onMouseMove={updateHover}
          aria-label="نوار زمان پخش"
        >
          <Progress.Section
            style={{ pointerEvents: "none", zIndex: 1 }}
            value={getPercent()}
          />
          {buffers}
          {getLength() < Infinity && showTimestamp && (
            <Badge
              className={styles.hoverTimestamp}
              style={{ left: `${hoverState.hoverPos * 100}%` }}
            >
              {formatTimestamp(
                hoverState.hoverTimestamp,
                isLiveStream ? zeroTime : undefined,
              )}
            </Badge>
          )}
        </Progress.Root>
        <span className={styles.time}>{formatTimestamp(getEnd())}</span>
        {isLiveStream && (
          <Badge className={styles.liveBadge} size="xs" color="red">
            زنده
          </Badge>
        )}
      </div>

      <div className={styles.actionRow}>
        <div className={styles.primaryActions}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.playButton}`}
            onClick={roomTogglePlay}
            disabled={disabled || isPauseDisabled}
            aria-label={paused ? "پخش" : "توقف"}
            title={paused ? "پخش" : "توقف"}
          >
            {paused ? (
              <IconPlayerPlayFilled size={21} />
            ) : (
              <IconPlayerPauseFilled size={21} />
            )}
          </button>
          {playlist.length > 0 && (
            <button
              type="button"
              className={actionClassName(styles.optionalAction)}
              onClick={() => roomPlaylistPlay(0)}
              aria-label="پخش بعدی"
              title="پخش بعدی"
            >
              <IconPlayerSkipForwardFilled size={19} />
            </button>
          )}
          <button
            type="button"
            className={`${styles.actionButton} ${styles.syncButton} ${
              isOutOfSync ? styles.syncNeeded : ""
            }`}
            title={
              isOutOfSync
                ? `اختلاف ${Math.abs(syncDelta).toFixed(1)} ثانیه — همگام‌سازی`
                : "همگام با اتاق"
            }
            aria-label="همگام‌سازی با پخش اتاق"
            onClick={() => {
              if (isLiveStream) {
                roomSeek(props.duration);
                return;
              }
              if (Number.isFinite(leaderTime)) {
                roomSeek(Math.max(0, Math.round(Number(leaderTime))));
                return;
              }
              localSeek();
            }}
          >
            <IconRefresh size={19} />
            {isOutOfSync && <span className={styles.syncDot} />}
          </button>
        </div>

        <div className={styles.secondaryActions}>
          <Menu disabled={disabled}>
            <Menu.Target>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.rateButton}`}
                aria-label="سرعت پخش"
                title="سرعت پخش"
              >
                {props.playbackRate?.toFixed(2)}×
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              {[
                { key: "Auto", text: "خودکار", value: 0 },
                { key: "0.25", text: "۰٫۲۵×", value: 0.25 },
                { key: "0.5", text: "۰٫۵×", value: 0.5 },
                { key: "1", text: "۱×", value: 1 },
                { key: "1.5", text: "۱٫۵×", value: 1.5 },
                { key: "2", text: "۲×", value: 2 },
                { key: "3", text: "۳×", value: 3 },
              ].map((item) => (
                <Menu.Item
                  key={item.key}
                  onClick={() => roomSetPlaybackRate(item.value)}
                  rightSection={
                    roomPlaybackRate === item.value ? <IconCheck /> : null
                  }
                >
                  {item.text}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          <button
            type="button"
            className={`${actionClassName(styles.optionalAction)} ${
              props.loop ? styles.activeAction : ""
            }`}
            onClick={() => !disabled && props.roomSetLoop(!props.loop)}
            aria-label="تکرار"
            title="تکرار"
          >
            <IconRepeat size={19} />
          </button>

          {props.isYouTube ? (
            <Menu>
              <Menu.Target>
                <button
                  type="button"
                  className={actionClassName()}
                  aria-label="زیرنویس"
                  title="زیرنویس"
                >
                  <IconBadgeCc size={21} />
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                {[
                  { key: "hidden", text: "خاموش", value: "hidden" },
                  { key: "en", text: "English", value: "showing" },
                  { key: "es", text: "Spanish", value: "showing" },
                ].map((item) => (
                  <Menu.Item
                    key={item.key}
                    onClick={() =>
                      props.localSetSubtitleMode(
                        item.value as TextTrackMode,
                        item.key,
                      )
                    }
                  >
                    {item.text}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          ) : (
            <button
              type="button"
              className={`${actionClassName()} ${
                subtitled ? styles.activeAction : ""
              }`}
              onClick={localSubtitleModal}
              aria-label="زیرنویس"
              title="زیرنویس"
            >
              <IconBadgeCc size={21} />
            </button>
          )}

          <button
            type="button"
            className={actionClassName(styles.theaterAction)}
            onClick={() => localFullScreen(false)}
            aria-label="حالت سینمایی"
            title="حالت سینمایی"
          >
            <IconTheater size={20} />
          </button>
          {!props.fullscreen && (
            <button
              type="button"
              className={actionClassName()}
              onClick={() => localFullScreen(true)}
              aria-label="تمام صفحه"
              title="تمام صفحه"
            >
              <IconMaximize size={20} />
            </button>
          )}

          <div className={styles.volumeControl}>
            <button
              type="button"
              className={actionClassName()}
              onClick={localToggleMute}
              aria-label={muted ? "وصل کردن صدا" : "بی‌صدا"}
              title={muted ? "وصل کردن صدا" : "بی‌صدا"}
            >
              {muted ? <IconVolumeOff size={21} /> : <IconVolume size={21} />}
            </button>
            <div className={styles.volumeSlider} dir="ltr">
              <input
                className={styles.volumeRange}
                type="range"
                dir="ltr"
                value={volumeValue}
                disabled={muted}
                min={0}
                max={1}
                step={0.01}
                onChange={(event) => {
                  const nextVolume = Number(event.currentTarget.value);
                  setVolumeValue(nextVolume);
                  props.localSetVolume(nextVolume);
                }}
                style={
                  {
                    "--volume-level": `${volumeValue * 100}%`,
                  } as React.CSSProperties
                }
                aria-label="بلندی صدا"
                aria-valuetext={`${Math.round(volumeValue * 100)}%`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
