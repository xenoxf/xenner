import { isTauri } from "@tauri-apps/api/core";

import type { WorkspaceGateway } from "../../types/workspace";
import { PreviewWorkspaceGateway } from "./previewGateway";
import { TauriWorkspaceGateway } from "./tauriGateway";

const gateway: WorkspaceGateway = isTauri()
  ? new TauriWorkspaceGateway()
  : new PreviewWorkspaceGateway();

export function getWorkspaceGateway(): WorkspaceGateway {
  return gateway;
}
