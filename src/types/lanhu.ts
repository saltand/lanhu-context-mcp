import type { AxiosInstance } from 'axios';

export interface LanhuClients {
  client: AxiosInstance;
  ddsClient: AxiosInstance;
}

export interface DesignMeta {
  id: string;
  name: string;
  url?: string;
  projectName?: string;
}

export interface LanhuDesignRequest {
  teamId: string;
  projectId: string;
  imageId: string;
}

export interface DownloadImageRequest {
  imgUrl: string;
}

// Request for project-level APIs (list images / sectors).
export interface LanhuProjectRequest {
  teamId: string;
  projectId: string;
}

// A single design image entry from /api/project/images.
export interface ProjectImage {
  id?: string;
  name?: string;
  width?: number;
  height?: number;
  url?: string;
  update_time?: string;
  latest_version?: string;
  dds_jump_status?: number;
  positions?: unknown[];
  [key: string]: unknown;
}

// Project image list payload.
export interface ProjectImagesResult {
  name?: string;
  images: ProjectImage[];
  hasNext?: boolean;
}

// A sector (分组) from /api/project/project_sectors.
export interface ProjectSector {
  id?: string;
  parent_id?: string;
  name?: string;
  order?: number;
  images?: string[];
  [key: string]: unknown;
}

// Parsed params from a Lanhu design URL.
export interface LanhuUrlParams {
  teamId: string;
  projectId: string;
  docId?: string;
  versionId?: string;
}

// A node in the DDS schema tree.
export interface SchemaNode {
  type?: string;
  props?: {
    className?: string;
    style?: Record<string, unknown>;
    src?: string;
    text?: string;
    [key: string]: unknown;
  };
  data?: { value?: string };
  style?: Record<string, unknown>;
  children?: SchemaNode[];
  alignJustify?: { justifyContent?: string; alignItems?: string };
  loop?: unknown[];
  loopData?: unknown[];
  loopType?: boolean;
  uiType?: string;
  uiTypeProb?: { placeholder?: string };
  [key: string]: unknown;
}

// Common response wrapper used by Lanhu APIs.
export interface LanhuApiResponse<T = unknown> {
  code: string | number;
  msg?: string;
  data?: T;
  result?: T;
}
