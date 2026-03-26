// SwitchBot API Types

export interface SwitchBotDevice {
  deviceId: string;
  deviceName: string;
  deviceType: SwitchBotDeviceType;
  enableCloudService: boolean;
  hubDeviceId?: string;
}

export type SwitchBotDeviceType =
  | "Hub"
  | "Hub Plus"
  | "Hub Mini"
  | "Hub 2"
  | "Bot"
  | "Curtain"
  | "Curtain3"
  | "Plug"
  | "Plug Mini (US)"
  | "Plug Mini (JP)"
  | "Meter"
  | "Meter Plus"
  | "WoIOSensor"
  | "Motion Sensor"
  | "Contact Sensor"
  | "Ceiling Light"
  | "Ceiling Light Pro"
  | "Color Bulb"
  | "Strip Light"
  | "Lock"
  | "Lock Pro"
  | "Keypad"
  | "Keypad Touch"
  | "Remote"
  | "Humidifier"
  | "Humidifier2"
  | "Evaporative Humidifier"
  | "Air Purifier VOC"
  | "Air Purifier Table VOC"
  | "Air Purifier PM2.5"
  | "Robot Vacuum Cleaner S1"
  | "Robot Vacuum Cleaner S1 Plus"
  | "Mini Robot Vacuum K10+"
  | "Blind Tilt"
  | "Battery Circulator Fan"
  | "Circulator Fan"
  | "CO2 Combo"
  | "Meter Pro"
  | "Meter Pro CO2"
  | string;

export interface SwitchBotDeviceStatus {
  deviceId: string;
  deviceType: SwitchBotDeviceType;
  hubDeviceId?: string;
  power?: "on" | "off";
  brightness?: number;
  color?: string;
  colorTemperature?: number;
  temperature?: number;
  humidity?: number;
  battery?: number;
  voltage?: number;
  weight?: number;
  electricityOfDay?: number;
  electricCurrent?: number;
  slidePosition?: number;
  moving?: boolean;
  moveDetected?: boolean;
  openState?: "open" | "close" | "timeOutNotClose";
  lockState?: "locked" | "unlocked" | "jammed";
  doorState?: "open" | "close";
  calibrate?: boolean;
  version?: string;
  // Humidifier specific
  nebulizationEfficiency?: number;
  auto?: boolean;
  childLock?: boolean;
  sound?: boolean;
  lackWater?: boolean;
  // Air Purifier specific
  mode?: string;
  speed?: number;
  filterLife?: number;
  fanSpeed?: number;
  // CO2 Sensor specific
  CO2?: number;
  lightLevel?: number;
}

export interface SwitchBotScene {
  sceneId: string;
  sceneName: string;
}

export interface SwitchBotInfraredRemote {
  deviceId: string;
  deviceName: string;
  remoteType: string;
  hubDeviceId: string;
}

export interface SwitchBotApiResponse<T> {
  statusCode: number;
  body: T;
  message: string;
}

export interface SwitchBotDevicesResponse {
  deviceList: SwitchBotDevice[];
  infraredRemoteList: SwitchBotInfraredRemote[];
}

export interface SwitchBotCommand {
  command: string;
  parameter?: string | number;
  commandType?: "command" | "customize";
}

// Device commands by type
export const SWITCHBOT_COMMANDS = {
  Bot: ["turnOn", "turnOff", "press"],
  Plug: ["turnOn", "turnOff"],
  "Plug Mini (US)": ["turnOn", "turnOff", "toggle"],
  "Plug Mini (JP)": ["turnOn", "turnOff", "toggle"],
  Curtain: ["setPosition", "turnOn", "turnOff", "pause"],
  Curtain3: ["setPosition", "turnOn", "turnOff", "pause"],
  Humidifier: ["turnOn", "turnOff", "setMode"],
  "Color Bulb": ["turnOn", "turnOff", "toggle", "setBrightness", "setColor"],
  "Strip Light": ["turnOn", "turnOff", "toggle", "setBrightness", "setColor"],
  "Ceiling Light": ["turnOn", "turnOff", "toggle", "setBrightness"],
  Lock: ["lock", "unlock"],
  "Lock Pro": ["lock", "unlock"],
} as const;

// Device icon mapping
export const SWITCHBOT_DEVICE_ICONS: Record<string, string> = {
  Hub: "router",
  "Hub Plus": "router",
  "Hub Mini": "router",
  "Hub 2": "router",
  Bot: "power",
  Curtain: "blinds",
  Curtain3: "blinds",
  Plug: "plug",
  "Plug Mini (US)": "plug",
  "Plug Mini (JP)": "plug",
  Meter: "thermometer",
  "Meter Plus": "thermometer",
  WoIOSensor: "thermometer",
  "Motion Sensor": "activity",
  "Contact Sensor": "door-open",
  "Ceiling Light": "lamp-ceiling",
  "Ceiling Light Pro": "lamp-ceiling",
  "Color Bulb": "lightbulb",
  "Strip Light": "lamp",
  Lock: "lock",
  "Lock Pro": "lock",
  Keypad: "keyboard",
  "Keypad Touch": "keyboard",
  Remote: "remote-control",
  Humidifier: "droplets",
  Humidifier2: "droplets",
  "Evaporative Humidifier": "droplets",
  "Air Purifier VOC": "wind",
  "Air Purifier Table VOC": "wind",
  "Air Purifier PM2.5": "wind",
  "Robot Vacuum Cleaner S1": "bot",
  "Robot Vacuum Cleaner S1 Plus": "bot",
  "Mini Robot Vacuum K10+": "bot",
  "Blind Tilt": "blinds",
  "Battery Circulator Fan": "fan",
  "Circulator Fan": "fan",
  "CO2 Combo": "gauge",
  "Meter Pro": "thermometer",
  "Meter Pro CO2": "gauge",
};
