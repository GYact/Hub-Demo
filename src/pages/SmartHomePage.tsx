import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Layout, RangeInput } from "../components";
import {
  Home,
  Power,
  PowerOff,
  Thermometer,
  Droplets,
  Lightbulb,
  Plug,
  Lock,
  LockOpen,
  Fan,
  Play,
  RefreshCw,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Settings,
  Eye,
  EyeOff,
  Blinds,
  Router,
  Activity,
  DoorOpen,
  Bot,
  Wind,
  Tv,
  AirVent,
  Gauge,
  Radio,
  Sun,
  Pause,
  Minus,
  Plus,
  Snowflake,
  Flame,
  Zap,
  Volume2,
  VolumeX,
  Baby,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ErrorBanner } from "../components/ErrorBanner";
import {
  useSwitchBot,
  type SwitchBotStatusHistoryRow,
} from "../hooks/useSwitchBot";
import type {
  SwitchBotDevice,
  SwitchBotDeviceStatus,
  SwitchBotInfraredRemote,
} from "../types/switchbot";

const getDeviceIcon = (deviceType: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    Hub: <Router size={20} className="text-gray-500" />,
    "Hub Plus": <Router size={20} className="text-gray-500" />,
    "Hub Mini": <Router size={20} className="text-gray-500" />,
    "Hub 2": <Router size={20} className="text-gray-500" />,
    Bot: <Power size={20} className="text-blue-500" />,
    Curtain: <Blinds size={20} className="text-indigo-500" />,
    Curtain3: <Blinds size={20} className="text-indigo-500" />,
    Plug: <Plug size={20} className="text-yellow-500" />,
    "Plug Mini (US)": <Plug size={20} className="text-yellow-500" />,
    "Plug Mini (JP)": <Plug size={20} className="text-yellow-500" />,
    Meter: <Thermometer size={20} className="text-red-500" />,
    "Meter Plus": <Thermometer size={20} className="text-red-500" />,
    WoIOSensor: <Thermometer size={20} className="text-red-500" />,
    "Motion Sensor": <Activity size={20} className="text-green-500" />,
    "Contact Sensor": <DoorOpen size={20} className="text-purple-500" />,
    "Ceiling Light": <Lightbulb size={20} className="text-amber-500" />,
    "Ceiling Light Pro": <Lightbulb size={20} className="text-amber-500" />,
    "Color Bulb": <Lightbulb size={20} className="text-amber-500" />,
    "Strip Light": <Lightbulb size={20} className="text-amber-500" />,
    Lock: <Lock size={20} className="text-slate-500" />,
    "Lock Pro": <Lock size={20} className="text-slate-500" />,
    Humidifier: <Droplets size={20} className="text-cyan-500" />,
    Humidifier2: <Droplets size={20} className="text-cyan-500" />,
    "Evaporative Humidifier": <Droplets size={20} className="text-cyan-500" />,
    "Air Purifier VOC": <Wind size={20} className="text-teal-500" />,
    "Air Purifier Table VOC": <Wind size={20} className="text-teal-500" />,
    "Air Purifier PM2.5": <Wind size={20} className="text-teal-500" />,
    "Robot Vacuum Cleaner S1": <Bot size={20} className="text-gray-500" />,
    "Robot Vacuum Cleaner S1 Plus": <Bot size={20} className="text-gray-500" />,
    "Mini Robot Vacuum K10+": <Bot size={20} className="text-gray-500" />,
    "Blind Tilt": <Blinds size={20} className="text-indigo-500" />,
    "Battery Circulator Fan": <Fan size={20} className="text-blue-400" />,
    "Circulator Fan": <Fan size={20} className="text-blue-400" />,
    "CO2 Combo": <Gauge size={20} className="text-emerald-500" />,
    "Meter Pro": <Thermometer size={20} className="text-red-500" />,
    "Meter Pro CO2": <Gauge size={20} className="text-emerald-500" />,
  };

  return iconMap[deviceType] || <Power size={20} className="text-gray-400" />;
};

const getIRRemoteIcon = (remoteType: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    "Air Conditioner": <AirVent size={20} className="text-blue-500" />,
    TV: <Tv size={20} className="text-purple-500" />,
    Light: <Lightbulb size={20} className="text-amber-500" />,
    Fan: <Fan size={20} className="text-cyan-500" />,
    IPTV: <Tv size={20} className="text-indigo-500" />,
    "Set Top Box": <Tv size={20} className="text-gray-500" />,
    DVD: <Tv size={20} className="text-red-500" />,
    Speaker: <Radio size={20} className="text-orange-500" />,
    Projector: <Tv size={20} className="text-slate-500" />,
    Camera: <Radio size={20} className="text-green-500" />,
    "Air Purifier": <Wind size={20} className="text-teal-500" />,
    "Water Heater": <Thermometer size={20} className="text-red-500" />,
    "Vacuum Cleaner": <Bot size={20} className="text-gray-500" />,
    Others: <Radio size={20} className="text-gray-400" />,
  };

  return iconMap[remoteType] || <Radio size={20} className="text-gray-400" />;
};

const DeviceCard = ({
  device,
  status,
  onGetStatus,
  onCommand,
  isLoading,
}: {
  device: SwitchBotDevice;
  status?: SwitchBotDeviceStatus;
  onGetStatus: (deviceId: string) => void;
  onCommand: (
    deviceId: string,
    command: string,
    parameter?: string | number,
  ) => void;
  isLoading: boolean;
}) => {
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [brightness, setBrightness] = useState(status?.brightness ?? 100);
  const [curtainPosition, setCurtainPosition] = useState(
    status?.slidePosition ?? 0,
  );
  const [atomizationLevel, setAtomizationLevel] = useState(
    status?.nebulizationEfficiency ?? 50,
  );

  const handleGetStatus = async () => {
    setLoadingStatus(true);
    await onGetStatus(device.deviceId);
    setLoadingStatus(false);
  };

  const isPowerDevice = [
    "Bot",
    "Plug",
    "Plug Mini (US)",
    "Plug Mini (JP)",
  ].includes(device.deviceType);

  const isLight = [
    "Color Bulb",
    "Strip Light",
    "Ceiling Light",
    "Ceiling Light Pro",
  ].includes(device.deviceType);

  const isLock = ["Lock", "Lock Pro"].includes(device.deviceType);
  const isCurtain = ["Curtain", "Curtain3", "Blind Tilt"].includes(
    device.deviceType,
  );
  const isSensor = [
    "Meter",
    "Meter Plus",
    "Meter Pro",
    "Meter Pro CO2",
    "CO2 Combo",
    "WoIOSensor",
    "Motion Sensor",
    "Contact Sensor",
  ].includes(device.deviceType);
  const isHub = ["Hub", "Hub Plus", "Hub Mini", "Hub 2"].includes(
    device.deviceType,
  );
  const isHumidifier = [
    "Humidifier",
    "Humidifier2",
    "Evaporative Humidifier",
  ].includes(device.deviceType);
  const isAirPurifier = [
    "Air Purifier VOC",
    "Air Purifier Table VOC",
    "Air Purifier PM2.5",
  ].includes(device.deviceType);
  const isFan = ["Battery Circulator Fan", "Circulator Fan"].includes(
    device.deviceType,
  );

  return (
    <div className="neu-card p-4 rounded-xl">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="neu-flat p-2 rounded-lg">
            {getDeviceIcon(device.deviceType)}
          </div>
          <div>
            <h4 className="font-medium neu-text-primary text-sm">
              {device.deviceName}
            </h4>
            <p className="text-xs neu-text-muted">{device.deviceType}</p>
          </div>
        </div>
        <button
          onClick={handleGetStatus}
          disabled={loadingStatus}
          className="p-1.5 neu-btn rounded-lg"
          title="Get status"
        >
          {loadingStatus ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
        </button>
      </div>

      {/* Status display */}
      {status && (
        <div className="mb-3 p-2 neu-flat rounded-lg text-xs space-y-1">
          {status.temperature !== undefined && (
            <div className="flex items-center gap-2">
              <Thermometer size={12} className="text-red-500" />
              <span className="neu-text-secondary">{status.temperature}°C</span>
            </div>
          )}
          {status.humidity !== undefined && (
            <div className="flex items-center gap-2">
              <Droplets size={12} className="text-cyan-500" />
              <span className="neu-text-secondary">{status.humidity}%</span>
            </div>
          )}
          {status.power && (
            <div className="flex items-center gap-2">
              <Power size={12} />
              <span
                className={
                  status.power === "on" ? "text-green-500" : "neu-text-muted"
                }
              >
                {status.power === "on" ? "ON" : "OFF"}
              </span>
            </div>
          )}
          {status.lockState && (
            <div className="flex items-center gap-2">
              {status.lockState === "locked" ? (
                <Lock size={12} className="text-green-500" />
              ) : (
                <LockOpen size={12} className="text-red-500" />
              )}
              <span className="neu-text-secondary">{status.lockState}</span>
            </div>
          )}
          {status.battery !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xs neu-text-muted">
                Battery: {status.battery}%
              </span>
            </div>
          )}
          {status.nebulizationEfficiency !== undefined && (
            <div className="flex items-center gap-2">
              <Droplets size={12} className="text-blue-500" />
              <span className="neu-text-secondary">
                Atomization: {status.nebulizationEfficiency}%
              </span>
            </div>
          )}
          {status.lackWater === true && (
            <div className="flex items-center gap-2 text-amber-500">
              <AlertCircle size={12} />
              <span>Water low</span>
            </div>
          )}
          {status.mode && (
            <div className="flex items-center gap-2">
              <Wind size={12} className="text-teal-500" />
              <span className="neu-text-secondary">Mode: {status.mode}</span>
            </div>
          )}
          {status.fanSpeed !== undefined && (
            <div className="flex items-center gap-2">
              <Fan size={12} className="text-blue-400" />
              <span className="neu-text-secondary">
                Speed: {status.fanSpeed}
              </span>
            </div>
          )}
          {status.CO2 !== undefined && (
            <div className="flex items-center gap-2">
              <Gauge size={12} className="text-emerald-500" />
              <span
                className={
                  status.CO2 > 1000
                    ? "text-red-500"
                    : status.CO2 > 800
                      ? "text-amber-500"
                      : "neu-text-secondary"
                }
              >
                CO2: {status.CO2} ppm
              </span>
            </div>
          )}
          {status.lightLevel !== undefined && (
            <div className="flex items-center gap-2">
              <Lightbulb size={12} className="text-amber-400" />
              <span className="neu-text-secondary">
                Light: {status.lightLevel}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Control buttons */}
      <div className="space-y-2">
        {isPowerDevice && (
          <div className="flex gap-2">
            <button
              onClick={() => onCommand(device.deviceId, "turnOn")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              <Power size={14} />
              ON
            </button>
            <button
              onClick={() => onCommand(device.deviceId, "turnOff")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-500 disabled:opacity-50"
            >
              <PowerOff size={14} />
              OFF
            </button>
          </div>
        )}

        {isLight && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => onCommand(device.deviceId, "turnOn")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 disabled:opacity-50"
              >
                <Power size={14} />
                ON
              </button>
              <button
                onClick={() => onCommand(device.deviceId, "turnOff")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-500 disabled:opacity-50"
              >
                <PowerOff size={14} />
                OFF
              </button>
            </div>
            <div className="p-2 neu-flat rounded-lg">
              <RangeInput
                value={brightness}
                onChange={(val) => {
                  setBrightness(val);
                  onCommand(device.deviceId, "setBrightness", val);
                }}
                min={1}
                max={100}
                label="Brightness"
                showValue={true}
                valueFormatter={(val) => `${val}%`}
              />
            </div>
          </>
        )}

        {isLock && (
          <div className="flex gap-2">
            <button
              onClick={() => onCommand(device.deviceId, "lock")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              <Lock size={14} />
              Lock
            </button>
            <button
              onClick={() => onCommand(device.deviceId, "unlock")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 disabled:opacity-50"
            >
              <LockOpen size={14} />
              Unlock
            </button>
          </div>
        )}

        {isCurtain && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => onCommand(device.deviceId, "turnOn")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                Open
              </button>
              <button
                onClick={() => onCommand(device.deviceId, "pause")}
                disabled={isLoading}
                title="Pause"
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 disabled:opacity-50"
              >
                <Pause size={14} />
              </button>
              <button
                onClick={() => onCommand(device.deviceId, "turnOff")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-500 disabled:opacity-50"
              >
                Close
              </button>
            </div>
            <div className="p-2 neu-flat rounded-lg">
              <RangeInput
                value={curtainPosition}
                onChange={(val) => {
                  setCurtainPosition(val);
                  onCommand(device.deviceId, "setPosition", `0,ff,${val}`);
                }}
                min={0}
                max={100}
                label="Position"
                showValue={true}
                valueFormatter={(val) => `${val}%`}
              />
            </div>
          </>
        )}

        {isSensor && (
          <div className="flex gap-2">
            <button
              onClick={handleGetStatus}
              disabled={loadingStatus}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg neu-btn text-xs font-medium"
            >
              {loadingStatus ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  <RefreshCw size={14} />
                  Update
                </>
              )}
            </button>
          </div>
        )}

        {isHumidifier && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => onCommand(device.deviceId, "turnOn")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-500 disabled:opacity-50"
              >
                <Power size={14} />
                ON
              </button>
              <button
                onClick={() => onCommand(device.deviceId, "turnOff")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-500 disabled:opacity-50"
              >
                <PowerOff size={14} />
                OFF
              </button>
            </div>
            {/* Mode selection */}
            <div className="flex gap-1">
              {["auto", "101", "102", "103"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => onCommand(device.deviceId, "setMode", mode)}
                  disabled={isLoading}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium ${
                    status?.mode === mode || (mode === "auto" && status?.auto)
                      ? "bg-cyan-600 text-white"
                      : "neu-flat neu-text-secondary hover:bg-white/5"
                  } disabled:opacity-50`}
                >
                  {mode === "auto"
                    ? "Auto"
                    : mode === "101"
                      ? "Low"
                      : mode === "102"
                        ? "Med"
                        : "High"}
                </button>
              ))}
            </div>
            {/* Atomization level slider */}
            <div className="p-2 neu-flat rounded-lg">
              <RangeInput
                value={atomizationLevel}
                onChange={(val) => {
                  setAtomizationLevel(val);
                  onCommand(device.deviceId, "setMode", val);
                }}
                min={0}
                max={100}
                label="Atomization level"
                showValue={true}
                valueFormatter={(val) => `${val}%`}
              />
            </div>
            {/* Child lock & Sound toggles */}
            <div className="flex gap-1">
              <button
                onClick={() =>
                  onCommand(
                    device.deviceId,
                    "setChildLock",
                    status?.childLock ? "off" : "on",
                  )
                }
                disabled={isLoading}
                title="Child lock"
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium ${
                  status?.childLock
                    ? "bg-amber-600 text-white"
                    : "neu-flat neu-text-secondary hover:bg-white/5"
                } disabled:opacity-50`}
              >
                <Baby size={12} />
                Lock
              </button>
              <button
                onClick={() =>
                  onCommand(
                    device.deviceId,
                    "setSound",
                    status?.sound ? "off" : "on",
                  )
                }
                disabled={isLoading}
                title="Sound"
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium ${
                  status?.sound
                    ? "bg-purple-600 text-white"
                    : "neu-flat neu-text-secondary hover:bg-white/5"
                } disabled:opacity-50`}
              >
                {status?.sound ? <Volume2 size={12} /> : <VolumeX size={12} />}
                Sound
              </button>
            </div>
          </>
        )}

        {isAirPurifier && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => onCommand(device.deviceId, "turnOn")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-500 disabled:opacity-50"
              >
                <Power size={14} />
                ON
              </button>
              <button
                onClick={() => onCommand(device.deviceId, "turnOff")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-500 disabled:opacity-50"
              >
                <PowerOff size={14} />
                OFF
              </button>
            </div>
            {/* Mode selection: 1=auto, 2=silent(sleep), 3=favorites, 4=pet */}
            <div className="flex gap-1">
              {[
                { mode: 1, label: "Auto" },
                { mode: 2, label: "Silent" },
                { mode: 4, label: "Pet" },
                { mode: 5, label: "Sleep" },
              ].map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => onCommand(device.deviceId, "setMode", mode)}
                  disabled={isLoading}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium ${
                    status?.mode === String(mode)
                      ? "bg-teal-600 text-white"
                      : "neu-flat neu-text-secondary hover:bg-white/5"
                  } disabled:opacity-50`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Fan speed: 1=low, 2=medium, 3=high, 4=max */}
            <div className="flex gap-1">
              {[
                { speed: 1, label: "Low" },
                { speed: 2, label: "Med" },
                { speed: 3, label: "High" },
                { speed: 4, label: "Max" },
              ].map(({ speed, label }) => (
                <button
                  key={speed}
                  onClick={() =>
                    onCommand(device.deviceId, "setFanSpeed", speed)
                  }
                  disabled={isLoading}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium ${
                    status?.fanSpeed === speed
                      ? "bg-blue-600 text-white"
                      : "neu-flat neu-text-secondary hover:bg-white/5"
                  } disabled:opacity-50`}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {isFan && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => onCommand(device.deviceId, "turnOn")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                <Power size={14} />
                ON
              </button>
              <button
                onClick={() => onCommand(device.deviceId, "turnOff")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-500 disabled:opacity-50"
              >
                <PowerOff size={14} />
                OFF
              </button>
            </div>
            {/* Wind mode: direct, natural, sleep, baby */}
            <div className="flex gap-1">
              {[
                { mode: "direct", label: "Direct" },
                { mode: "natural", label: "Natural" },
                { mode: "sleep", label: "Sleep" },
                { mode: "baby", label: "Baby" },
              ].map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() =>
                    onCommand(device.deviceId, "setWindMode", mode)
                  }
                  disabled={isLoading}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium ${
                    status?.mode === mode
                      ? "bg-blue-600 text-white"
                      : "neu-flat neu-text-secondary hover:bg-white/5"
                  } disabled:opacity-50`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Fan speed: 1=25%, 2=50%, 3=75%, 4=100% */}
            <div className="flex gap-1">
              {[
                { speed: 25, label: "1" },
                { speed: 50, label: "2" },
                { speed: 75, label: "3" },
                { speed: 100, label: "4" },
              ].map(({ speed, label }) => (
                <button
                  key={speed}
                  onClick={() =>
                    onCommand(device.deviceId, "setWindSpeed", speed)
                  }
                  disabled={isLoading}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium ${
                    status?.fanSpeed === speed
                      ? "bg-cyan-600 text-white"
                      : "neu-flat neu-text-secondary hover:bg-white/5"
                  } disabled:opacity-50`}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {isHub && (
          <div className="flex gap-2">
            <div className="flex-1 flex items-center justify-center px-3 py-2 rounded-lg neu-flat text-xs neu-text-muted">
              <Router size={14} className="mr-1" />
              Hub Device
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// IR Remote Card Component
const IRRemoteCard = ({
  remote,
  onCommand,
  onCommandWithParam,
  isLoading,
}: {
  remote: SwitchBotInfraredRemote;
  onCommand: (deviceId: string, command: string, commandType?: string) => void;
  onCommandWithParam: (
    deviceId: string,
    command: string,
    parameter: string,
  ) => void;
  isLoading: boolean;
}) => {
  const isAC = remote.remoteType === "Air Conditioner";
  const isTV = ["TV", "IPTV", "Set Top Box", "DVD", "Projector"].includes(
    remote.remoteType,
  );
  const isLight = remote.remoteType === "Light";
  const isFan = remote.remoteType === "Fan";

  const [acTemp, setAcTemp] = useState(24);
  const [acMode, setAcMode] = useState<1 | 2 | 3 | 4 | 5>(1); // 1=auto, 2=cool, 3=dry, 4=fan, 5=heat
  const [acFanSpeed, setAcFanSpeed] = useState<1 | 2 | 3 | 4>(1); // 1=auto, 2=low, 3=medium, 4=high
  const [acPower, setAcPower] = useState<"on" | "off">("off");

  const handleAcCommand = (
    temp: number,
    mode: number,
    fanSpeed: number,
    power: "on" | "off",
  ) => {
    // setAll command format: temp,mode,fanSpeed,powerState
    const param = `${temp},${mode},${fanSpeed},${power}`;
    onCommandWithParam(remote.deviceId, "setAll", param);
  };

  return (
    <div className="neu-card p-4 rounded-xl">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="neu-flat p-2 rounded-lg">
            {getIRRemoteIcon(remote.remoteType)}
          </div>
          <div>
            <h4 className="font-medium neu-text-primary text-sm">
              {remote.deviceName}
            </h4>
            <p className="text-xs neu-text-muted">{remote.remoteType}</p>
          </div>
        </div>
      </div>

      {/* Control buttons */}
      <div className="space-y-2">
        {isAC && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setAcPower("on");
                  handleAcCommand(acTemp, acMode, acFanSpeed, "on");
                }}
                disabled={isLoading}
                className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50 ${
                  acPower === "on"
                    ? "bg-blue-600 text-white"
                    : "neu-flat neu-text-secondary hover:bg-white/5"
                }`}
              >
                <Power size={14} />
                ON
              </button>
              <button
                onClick={() => {
                  setAcPower("off");
                  handleAcCommand(acTemp, acMode, acFanSpeed, "off");
                }}
                disabled={isLoading}
                className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50 ${
                  acPower === "off"
                    ? "bg-slate-600 text-white"
                    : "neu-flat neu-text-secondary hover:bg-white/5"
                }`}
              >
                <PowerOff size={14} />
                OFF
              </button>
            </div>

            {/* Temperature control */}
            <div className="flex items-center gap-2 p-2 neu-flat rounded-lg">
              <button
                onClick={() => {
                  const newTemp = Math.max(16, acTemp - 1);
                  setAcTemp(newTemp);
                  if (acPower === "on") {
                    handleAcCommand(newTemp, acMode, acFanSpeed, acPower);
                  }
                }}
                disabled={isLoading || acTemp <= 16}
                className="p-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-50"
                title="Decrease temperature"
              >
                <Minus size={14} />
              </button>
              <div className="flex-1 text-center">
                <span className="text-lg font-semibold neu-text-primary">
                  {acTemp}°C
                </span>
              </div>
              <button
                onClick={() => {
                  const newTemp = Math.min(30, acTemp + 1);
                  setAcTemp(newTemp);
                  if (acPower === "on") {
                    handleAcCommand(newTemp, acMode, acFanSpeed, acPower);
                  }
                }}
                disabled={isLoading || acTemp >= 30}
                className="p-1.5 rounded-lg bg-red-600 text-white disabled:opacity-50"
                title="Increase temperature"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Mode selection */}
            <div className="flex gap-1">
              {[
                { mode: 1 as const, icon: Zap, label: "Auto" },
                { mode: 2 as const, icon: Snowflake, label: "Cool" },
                { mode: 5 as const, icon: Flame, label: "Heat" },
                { mode: 4 as const, icon: Fan, label: "Fan" },
              ].map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setAcMode(mode);
                    if (acPower === "on") {
                      handleAcCommand(acTemp, mode, acFanSpeed, acPower);
                    }
                  }}
                  disabled={isLoading}
                  title={label}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${
                    acMode === mode
                      ? mode === 2
                        ? "bg-blue-600 text-white"
                        : mode === 5
                          ? "bg-orange-600 text-white"
                          : "bg-cyan-600 text-white"
                      : "neu-flat neu-text-secondary hover:bg-white/5"
                  }`}
                >
                  <Icon size={12} />
                </button>
              ))}
            </div>

            {/* Fan speed */}
            <div className="flex gap-1">
              {[
                { speed: 1 as const, label: "Auto" },
                { speed: 2 as const, label: "Low" },
                { speed: 3 as const, label: "Med" },
                { speed: 4 as const, label: "High" },
              ].map(({ speed, label }) => (
                <button
                  key={speed}
                  onClick={() => {
                    setAcFanSpeed(speed);
                    if (acPower === "on") {
                      handleAcCommand(acTemp, acMode, speed, acPower);
                    }
                  }}
                  disabled={isLoading}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${
                    acFanSpeed === speed
                      ? "bg-gray-600 text-white"
                      : "neu-flat neu-text-secondary hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {isTV && (
          <div className="flex gap-2">
            <button
              onClick={() => onCommand(remote.deviceId, "turnOn", "command")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-500 disabled:opacity-50"
            >
              <Power size={14} />
              ON
            </button>
            <button
              onClick={() => onCommand(remote.deviceId, "turnOff", "command")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-500 disabled:opacity-50"
            >
              <PowerOff size={14} />
              OFF
            </button>
          </div>
        )}

        {isLight && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => onCommand(remote.deviceId, "turnOn", "command")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 disabled:opacity-50"
              >
                <Power size={14} />
                ON
              </button>
              <button
                onClick={() => onCommand(remote.deviceId, "turnOff", "command")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-500 disabled:opacity-50"
              >
                <PowerOff size={14} />
                OFF
              </button>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() =>
                  onCommand(remote.deviceId, "brightnessUp", "command")
                }
                disabled={isLoading}
                title="Brightness up"
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg neu-flat text-xs font-medium hover:bg-white/5 disabled:opacity-50"
              >
                <Sun size={12} />
                <Plus size={10} />
              </button>
              <button
                onClick={() =>
                  onCommand(remote.deviceId, "brightnessDown", "command")
                }
                disabled={isLoading}
                title="Brightness down"
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg neu-flat text-xs font-medium hover:bg-white/5 disabled:opacity-50"
              >
                <Sun size={12} />
                <Minus size={10} />
              </button>
            </div>
          </>
        )}

        {isFan && (
          <div className="flex gap-2">
            <button
              onClick={() => onCommand(remote.deviceId, "turnOn", "command")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-500 disabled:opacity-50"
            >
              <Power size={14} />
              ON
            </button>
            <button
              onClick={() => onCommand(remote.deviceId, "turnOff", "command")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-500 disabled:opacity-50"
            >
              <PowerOff size={14} />
              OFF
            </button>
          </div>
        )}

        {!isAC && !isTV && !isLight && !isFan && (
          <div className="flex gap-2">
            <button
              onClick={() => onCommand(remote.deviceId, "turnOn", "command")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-gray-600 text-white text-xs font-medium hover:bg-gray-500 disabled:opacity-50"
            >
              <Power size={14} />
              ON
            </button>
            <button
              onClick={() => onCommand(remote.deviceId, "turnOff", "command")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium hover:bg-slate-500 disabled:opacity-50"
            >
              <PowerOff size={14} />
              OFF
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const StatusHistoryEntry = ({
  entry,
}: {
  entry: SwitchBotStatusHistoryRow;
}) => {
  const status = entry.status;
  const statusItems: string[] = [];

  if (status.temperature !== undefined)
    statusItems.push(`${status.temperature}°C`);
  if (status.humidity !== undefined) statusItems.push(`${status.humidity}%`);
  if (status.CO2 !== undefined) statusItems.push(`CO2: ${status.CO2}ppm`);
  if (status.power) statusItems.push(`Power: ${status.power}`);
  if (status.battery !== undefined) statusItems.push(`Bat: ${status.battery}%`);
  if (status.lockState) statusItems.push(`Lock: ${status.lockState}`);
  if (status.lightLevel !== undefined)
    statusItems.push(`Light: ${status.lightLevel}`);

  // Fallback: show raw keys if no known fields matched
  if (statusItems.length === 0) {
    for (const [k, v] of Object.entries(status)) {
      if (k !== "deviceId" && k !== "deviceType" && k !== "hubDeviceId") {
        statusItems.push(`${k}: ${v}`);
      }
    }
  }

  return (
    <div className="neu-flat p-3 rounded-lg flex items-start gap-3">
      <div className="flex-shrink-0 pt-0.5">
        {getDeviceIcon(entry.device_type ?? "")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium neu-text-primary truncate">
            {entry.device_name ?? entry.device_id}
          </span>
          <span className="text-xs neu-text-muted flex-shrink-0 ml-2">
            {new Date(entry.recorded_at).toLocaleString()}
          </span>
        </div>
        <p className="text-xs neu-text-secondary mt-0.5">
          {statusItems.join(" / ")}
        </p>
      </div>
    </div>
  );
};

const ConfigureDialog = ({
  isOpen,
  onClose,
  onConfigure,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfigure: (token: string, secret: string) => void;
}) => {
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim() && secret.trim()) {
      onConfigure(token.trim(), secret.trim());
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="neu-card p-4 md:p-6 rounded-xl w-full max-w-[calc(100vw-2rem)] md:max-w-md my-auto">
        <h3 className="text-lg font-semibold neu-text-primary mb-4">
          Set up SwitchBot API
        </h3>
        <p className="text-sm neu-text-secondary mb-4">
          Get the API token and secret key from the SwitchBot app settings.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs neu-text-secondary mb-1 block">
              API Token
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your API token"
                className="w-full neu-input px-3 py-2 pr-10 rounded-lg text-sm"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 neu-text-muted"
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs neu-text-secondary mb-1 block">
              Secret Key
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Enter your secret key"
                className="w-full neu-input px-3 py-2 pr-10 rounded-lg text-sm"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 neu-text-muted"
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 neu-btn px-4 py-2 rounded-lg text-sm neu-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!token.trim() || !secret.trim()}
              className="flex-1 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export const SmartHomePage = () => {
  const navigate = useNavigate();
  const {
    isConfigured,
    isLoading,
    error,
    devices,
    infraredRemotes,
    scenes,
    deviceStatuses,
    statusHistory,
    configure,
    disconnect,
    getDeviceStatus,
    sendCommand,
    executeScene,
    refresh,
    fetchStatusHistory,
  } = useSwitchBot();

  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [executingScene, setExecutingScene] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyDeviceFilter, setHistoryDeviceFilter] = useState<string>("");

  useEffect(() => {
    if (isConfigured && showHistory) {
      fetchStatusHistory(historyDeviceFilter || undefined);
    }
  }, [isConfigured, showHistory, historyDeviceFilter, fetchStatusHistory]);

  const handleExecuteScene = useCallback(
    async (sceneId: string) => {
      setExecutingScene(sceneId);
      await executeScene(sceneId);
      setExecutingScene(null);
    },
    [executeScene],
  );

  const handleDeviceCommand = useCallback(
    async (deviceId: string, command: string, parameter?: string | number) => {
      await sendCommand(deviceId, command, parameter);
    },
    [sendCommand],
  );

  const handleIRCommand = useCallback(
    async (deviceId: string, command: string, _commandType?: string) => {
      // For IR remotes, commandType is passed but we don't use it as parameter
      await sendCommand(deviceId, command);
    },
    [sendCommand],
  );

  const handleIRCommandWithParam = useCallback(
    async (deviceId: string, command: string, parameter: string) => {
      await sendCommand(deviceId, command, parameter);
    },
    [sendCommand],
  );

  // Separate hub devices from other devices
  const hubDevices = devices.filter((d) =>
    ["Hub", "Hub Plus", "Hub Mini", "Hub 2"].includes(d.deviceType),
  );
  const controllableDevices = devices.filter(
    (d) => !["Hub", "Hub Plus", "Hub Mini", "Hub 2"].includes(d.deviceType),
  );

  const headerLeft = (
    <div className="flex items-center gap-0.5 md:gap-1">
      <button
        onClick={() => navigate("/ai")}
        className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary rounded-lg transition-colors"
        title="Back to AI"
      >
        <ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />
      </button>
      <button
        onClick={refresh}
        disabled={isLoading}
        className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
        title="Refresh"
      >
        {isLoading ? (
          <Loader2
            size={16}
            className={`animate-spin md:w-[18px] md:h-[18px]`}
          />
        ) : (
          <RefreshCw size={16} className="md:w-[18px] md:h-[18px]" />
        )}
      </button>
    </div>
  );

  const headerRight = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowConfigDialog(true)}
        className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors"
        title="Settings"
      >
        <Settings size={16} className="md:w-[18px] md:h-[18px]" />
      </button>
      <button
        onClick={disconnect}
        className="flex items-center gap-1.5 px-2 py-1.5 md:px-3 md:py-2 rounded-lg hover:bg-red-50 text-red-500 text-xs md:text-sm font-medium transition-all"
      >
        Disconnect
      </button>
    </div>
  );

  if (!isConfigured) {
    return (
      <Layout pageTitle="Smart Home" headerLeft={headerLeft}>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 mobile-scroll-pad">
          <div className="max-w-2xl mx-auto text-center py-12">
            <Home
              size={64}
              className="mx-auto mb-6 text-emerald-500 opacity-50"
            />
            <h2 className="text-xl font-semibold neu-text-primary mb-4">
              Connect to Smart Home
            </h2>
            <p className="neu-text-secondary mb-6">
              Set up the SwitchBot API to control your smart home devices.
            </p>
            <button
              onClick={() => setShowConfigDialog(true)}
              className="bg-emerald-600 text-white hover:bg-emerald-500 px-6 py-3 rounded-xl font-medium shadow-lg transition-colors"
            >
              Set up SwitchBot
            </button>
          </div>
          <ConfigureDialog
            isOpen={showConfigDialog}
            onClose={() => setShowConfigDialog(false)}
            onConfigure={configure}
          />
        </main>
      </Layout>
    );
  }

  return (
    <Layout
      pageTitle="Smart Home"
      headerLeft={headerLeft}
      headerRight={headerRight}
    >
      <main className="flex-1 overflow-y-auto p-4 md:p-6 mobile-scroll-pad">
        <div className="max-w-5xl mx-auto">
          {/* Error */}
          {error && (
            <ErrorBanner
              message={error}
              className="mb-4 rounded-lg border-b-0"
            />
          )}

          {/* Scenes */}
          {scenes.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
                Scenes
              </h3>
              <div className="flex flex-wrap gap-2">
                {scenes.map((scene) => (
                  <button
                    key={scene.sceneId}
                    onClick={() => handleExecuteScene(scene.sceneId)}
                    disabled={executingScene === scene.sceneId}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg neu-card neu-card-hover text-sm font-medium disabled:opacity-50"
                  >
                    {executingScene === scene.sceneId ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Play size={16} className="text-emerald-500" />
                    )}
                    {scene.sceneName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Devices */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
              Devices ({controllableDevices.length})
            </h3>
            {isLoading && controllableDevices.length === 0 ? (
              <div className="neu-card p-8 rounded-xl text-center">
                <Loader2
                  size={32}
                  className="animate-spin mx-auto mb-4 neu-text-muted"
                />
                <p className="neu-text-secondary">Loading devices...</p>
              </div>
            ) : controllableDevices.length === 0 ? (
              <div className="neu-card p-8 rounded-xl text-center">
                <Home
                  size={48}
                  className="mx-auto mb-4 neu-text-muted opacity-50"
                />
                <p className="neu-text-secondary">No devices found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {controllableDevices.map((device) => (
                  <DeviceCard
                    key={device.deviceId}
                    device={device}
                    status={deviceStatuses.get(device.deviceId)}
                    onGetStatus={getDeviceStatus}
                    onCommand={handleDeviceCommand}
                    isLoading={isLoading}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Infrared Remotes */}
          {infraredRemotes.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
                IR Remotes ({infraredRemotes.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {infraredRemotes.map((remote) => (
                  <IRRemoteCard
                    key={remote.deviceId}
                    remote={remote}
                    onCommand={handleIRCommand}
                    onCommandWithParam={handleIRCommandWithParam}
                    isLoading={isLoading}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Hub Devices */}
          {hubDevices.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
                Hubs ({hubDevices.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {hubDevices.map((device) => (
                  <DeviceCard
                    key={device.deviceId}
                    device={device}
                    status={deviceStatuses.get(device.deviceId)}
                    onGetStatus={getDeviceStatus}
                    onCommand={handleDeviceCommand}
                    isLoading={isLoading}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Status History */}
          <div className="mb-6">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3 hover:neu-text-primary transition-colors"
            >
              <History size={16} />
              Status History
              {showHistory ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>

            {showHistory && (
              <div className="space-y-3">
                {/* Device filter */}
                {devices.length > 0 && (
                  <select
                    value={historyDeviceFilter}
                    onChange={(e) => setHistoryDeviceFilter(e.target.value)}
                    className="neu-input px-3 py-2 rounded-lg text-sm w-full sm:w-auto"
                  >
                    <option value="">All Devices</option>
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.deviceName}
                      </option>
                    ))}
                  </select>
                )}

                {statusHistory.length === 0 ? (
                  <div className="neu-card p-6 rounded-xl text-center">
                    <History
                      size={32}
                      className="mx-auto mb-3 neu-text-muted opacity-50"
                    />
                    <p className="neu-text-secondary text-sm">
                      No history recorded yet. Data is collected hourly.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {statusHistory.map((entry) => (
                      <StatusHistoryEntry key={entry.id} entry={entry} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Config Dialog */}
      <ConfigureDialog
        isOpen={showConfigDialog}
        onClose={() => setShowConfigDialog(false)}
        onConfigure={configure}
      />
    </Layout>
  );
};
