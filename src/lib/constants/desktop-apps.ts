import type { LucideIcon } from "lucide-react";
import {
  Paintbrush,
  Image,
  PenTool,
  Music,
  FileSpreadsheet,
  Video,
  Film,
  Scissors,
  Phone,
  Workflow,
  Bot,
} from "lucide-react";

export interface DesktopAppCapability {
  id: string;
  label: string;
  command: string;
  description: string;
  parameters: DesktopAppParameter[];
}

export interface DesktopAppParameter {
  name: string;
  label: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  placeholder?: string;
}

export interface DesktopAppDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
  cliName: string;
  description: string;
  capabilities: DesktopAppCapability[];
}

const BLENDER_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "render",
    label: "Render",
    command: "render",
    description: "Render a scene to an image or animation",
    parameters: [
      { name: "scene", label: "Scene File", type: "string", required: true, placeholder: "/path/to/scene.blend" },
      { name: "output", label: "Output Path", type: "string", required: false, placeholder: "/tmp/render_" },
      { name: "frame", label: "Frame Number", type: "number", required: false, placeholder: "1" },
      { name: "engine", label: "Render Engine", type: "string", required: false, placeholder: "CYCLES" },
    ],
  },
  {
    id: "export",
    label: "Export",
    command: "export",
    description: "Export scene to another format",
    parameters: [
      { name: "scene", label: "Scene File", type: "string", required: true, placeholder: "/path/to/scene.blend" },
      { name: "format", label: "Format", type: "string", required: true, placeholder: "fbx" },
      { name: "output", label: "Output Path", type: "string", required: true, placeholder: "/tmp/export.fbx" },
    ],
  },
  {
    id: "script",
    label: "Run Script",
    command: "script",
    description: "Execute a Python script in Blender",
    parameters: [
      { name: "scriptPath", label: "Script Path", type: "string", required: true, placeholder: "/path/to/script.py" },
    ],
  },
];

const GIMP_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "batch",
    label: "Batch Process",
    command: "batch",
    description: "Run a Script-Fu batch command",
    parameters: [
      { name: "script", label: "Script-Fu Command", type: "string", required: true, placeholder: "(gimp-image-list)" },
    ],
  },
  {
    id: "convert",
    label: "Convert Image",
    command: "convert",
    description: "Convert image format",
    parameters: [
      { name: "input", label: "Input File", type: "string", required: true, placeholder: "/path/to/image.png" },
      { name: "output", label: "Output File", type: "string", required: true, placeholder: "/path/to/output.jpg" },
    ],
  },
];

const INKSCAPE_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "export_png",
    label: "Export PNG",
    command: "export-png",
    description: "Export SVG to PNG",
    parameters: [
      { name: "input", label: "Input SVG", type: "string", required: true, placeholder: "/path/to/drawing.svg" },
      { name: "output", label: "Output PNG", type: "string", required: true, placeholder: "/path/to/output.png" },
      { name: "dpi", label: "DPI", type: "number", required: false, placeholder: "300" },
    ],
  },
  {
    id: "export_pdf",
    label: "Export PDF",
    command: "export-pdf",
    description: "Export SVG to PDF",
    parameters: [
      { name: "input", label: "Input SVG", type: "string", required: true, placeholder: "/path/to/drawing.svg" },
      { name: "output", label: "Output PDF", type: "string", required: true, placeholder: "/path/to/output.pdf" },
    ],
  },
];

const AUDACITY_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "convert",
    label: "Convert Audio",
    command: "convert",
    description: "Convert audio format",
    parameters: [
      { name: "input", label: "Input File", type: "string", required: true, placeholder: "/path/to/audio.wav" },
      { name: "output", label: "Output File", type: "string", required: true, placeholder: "/path/to/output.mp3" },
    ],
  },
  {
    id: "trim",
    label: "Trim Audio",
    command: "trim",
    description: "Trim audio to start/end time",
    parameters: [
      { name: "input", label: "Input File", type: "string", required: true, placeholder: "/path/to/audio.wav" },
      { name: "start", label: "Start (seconds)", type: "number", required: true, placeholder: "0" },
      { name: "end", label: "End (seconds)", type: "number", required: true, placeholder: "30" },
      { name: "output", label: "Output File", type: "string", required: true, placeholder: "/path/to/trimmed.wav" },
    ],
  },
];

const LIBREOFFICE_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "convert",
    label: "Convert Document",
    command: "convert-to",
    description: "Convert document to another format",
    parameters: [
      { name: "input", label: "Input File", type: "string", required: true, placeholder: "/path/to/document.docx" },
      { name: "format", label: "Target Format", type: "string", required: true, placeholder: "pdf" },
      { name: "outdir", label: "Output Directory", type: "string", required: false, placeholder: "/tmp/" },
    ],
  },
  {
    id: "print",
    label: "Print Document",
    command: "print",
    description: "Print a document",
    parameters: [
      { name: "input", label: "Input File", type: "string", required: true, placeholder: "/path/to/document.pdf" },
    ],
  },
];

const OBS_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "start_recording",
    label: "Start Recording",
    command: "start-recording",
    description: "Start OBS recording",
    parameters: [],
  },
  {
    id: "stop_recording",
    label: "Stop Recording",
    command: "stop-recording",
    description: "Stop OBS recording",
    parameters: [],
  },
  {
    id: "switch_scene",
    label: "Switch Scene",
    command: "switch-scene",
    description: "Switch to a named scene",
    parameters: [
      { name: "scene", label: "Scene Name", type: "string", required: true, placeholder: "Scene 1" },
    ],
  },
];

const KDENLIVE_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "render",
    label: "Render Project",
    command: "render",
    description: "Render a Kdenlive project",
    parameters: [
      { name: "project", label: "Project File", type: "string", required: true, placeholder: "/path/to/project.kdenlive" },
      { name: "output", label: "Output File", type: "string", required: true, placeholder: "/path/to/output.mp4" },
    ],
  },
];

const SHOTCUT_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "convert",
    label: "Convert Video",
    command: "convert",
    description: "Convert video file format",
    parameters: [
      { name: "input", label: "Input File", type: "string", required: true, placeholder: "/path/to/video.mp4" },
      { name: "output", label: "Output File", type: "string", required: true, placeholder: "/path/to/output.webm" },
    ],
  },
];

const ZOOM_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "join",
    label: "Join Meeting",
    command: "join",
    description: "Join a Zoom meeting by ID",
    parameters: [
      { name: "meetingId", label: "Meeting ID", type: "string", required: true, placeholder: "123-456-789" },
      { name: "password", label: "Password", type: "string", required: false, placeholder: "" },
    ],
  },
];

const DRAWIO_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "export",
    label: "Export Diagram",
    command: "export",
    description: "Export diagram to image or PDF",
    parameters: [
      { name: "input", label: "Input File", type: "string", required: true, placeholder: "/path/to/diagram.drawio" },
      { name: "output", label: "Output File", type: "string", required: true, placeholder: "/path/to/output.png" },
      { name: "format", label: "Format", type: "string", required: false, placeholder: "png" },
    ],
  },
];

const ANYGEN_CAPABILITIES: DesktopAppCapability[] = [
  {
    id: "run",
    label: "Run Command",
    command: "run",
    description: "Run an arbitrary CLI command via the bridge",
    parameters: [
      { name: "command", label: "Command", type: "string", required: true, placeholder: "echo hello" },
    ],
  },
];

export const DESKTOP_APPS: DesktopAppDefinition[] = [
  {
    id: "blender",
    label: "Blender",
    icon: Paintbrush,
    cliName: "blender",
    description: "3D modeling, rendering, and animation",
    capabilities: BLENDER_CAPABILITIES,
  },
  {
    id: "gimp",
    label: "GIMP",
    icon: Image,
    cliName: "gimp",
    description: "Image editing and manipulation",
    capabilities: GIMP_CAPABILITIES,
  },
  {
    id: "inkscape",
    label: "Inkscape",
    icon: PenTool,
    cliName: "inkscape",
    description: "Vector graphics editor",
    capabilities: INKSCAPE_CAPABILITIES,
  },
  {
    id: "audacity",
    label: "Audacity",
    icon: Music,
    cliName: "audacity",
    description: "Audio editing and processing",
    capabilities: AUDACITY_CAPABILITIES,
  },
  {
    id: "libreoffice",
    label: "LibreOffice",
    icon: FileSpreadsheet,
    cliName: "libreoffice",
    description: "Office suite (documents, spreadsheets, presentations)",
    capabilities: LIBREOFFICE_CAPABILITIES,
  },
  {
    id: "obs-studio",
    label: "OBS Studio",
    icon: Video,
    cliName: "obs",
    description: "Screen recording and live streaming",
    capabilities: OBS_CAPABILITIES,
  },
  {
    id: "kdenlive",
    label: "Kdenlive",
    icon: Film,
    cliName: "kdenlive",
    description: "Non-linear video editor",
    capabilities: KDENLIVE_CAPABILITIES,
  },
  {
    id: "shotcut",
    label: "Shotcut",
    icon: Scissors,
    cliName: "shotcut",
    description: "Cross-platform video editor",
    capabilities: SHOTCUT_CAPABILITIES,
  },
  {
    id: "zoom",
    label: "Zoom",
    icon: Phone,
    cliName: "zoom",
    description: "Video conferencing",
    capabilities: ZOOM_CAPABILITIES,
  },
  {
    id: "drawio",
    label: "Draw.io",
    icon: Workflow,
    cliName: "drawio",
    description: "Diagram and flowchart editor",
    capabilities: DRAWIO_CAPABILITIES,
  },
  {
    id: "anygen",
    label: "AnyGen",
    icon: Bot,
    cliName: "anygen",
    description: "Generic CLI bridge for any application",
    capabilities: ANYGEN_CAPABILITIES,
  },
];

export function getDesktopApp(appId: string): DesktopAppDefinition | undefined {
  return DESKTOP_APPS.find((app) => app.id === appId);
}

export function getCapability(
  appId: string,
  capabilityId: string,
): DesktopAppCapability | undefined {
  const app = getDesktopApp(appId);
  if (!app) return undefined;
  return app.capabilities.find((c) => c.id === capabilityId);
}
