import type { ProjectImage, ProjectSector } from '../types/lanhu.ts';

export interface DesignListItem {
  id: string;
  name: string;
  width?: number;
  height?: number;
  updateTime?: string;
  ddsReady: boolean;
  latestVersion?: string;
  url?: string;
}

export interface SectorGroup {
  id: string;
  name: string;
  parentId?: string;
  order: number;
  imageIds: string[];
}

export interface ProjectList {
  projectName?: string;
  images: DesignListItem[];
  sectors: SectorGroup[];
  hasNext: boolean;
}

/**
 * Turn raw API payloads into a normalized project list.
 * images is the union of every image seen in `images` payload order;
 * sectors preserves the API order (which reflects drag order).
 */
export function buildProjectList(
  imagesResult: {
    name?: string;
    images: ProjectImage[];
    hasNext?: boolean;
  },
  sectors: ProjectSector[],
  projectName?: string
): ProjectList {
  const images: DesignListItem[] = imagesResult.images.map(img => ({
    id: String(img.id ?? ''),
    name: String(img.name ?? img.id ?? ''),
    width: toNumber(img.width),
    height: toNumber(img.height),
    updateTime: img.update_time as string | undefined,
    ddsReady: img.dds_jump_status === 1,
    latestVersion: img.latest_version as string | undefined,
    url: img.url as string | undefined
  }));

  const sectorGroups: SectorGroup[] = sectors.map(s => ({
    id: String(s.id ?? ''),
    name: String(s.name ?? ''),
    parentId: s.parent_id ? String(s.parent_id) : undefined,
    order: typeof s.order === 'number' ? s.order : 0,
    imageIds: Array.isArray(s.images) ? s.images.map(id => String(id)) : []
  }));

  return {
    projectName: projectName ?? imagesResult.name,
    images,
    sectors: sectorGroups,
    hasNext: imagesResult.hasNext === true
  };
}

function toNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export interface FormatOptions {
  /** Case-insensitive substring filter on image name. */
  query?: string;
  /** Filter to a single sector (by name, case-insensitive substring). */
  sector?: string;
  /** Emit preview url column. Off by default to save tokens. */
  includeUrls?: boolean;
  /** Lanhu host for detail links. */
  baseUrl?: string;
  /** Emit design detail links (get_design_context input). On by default. */
  includeLinks?: boolean;
  /** Project/team ids used to build detailDetach links. */
  teamId?: string;
  projectId?: string;
}

/**
 * Format the project list as compact markdown.
 * One section per sector (nested, sorted by order desc), images as list rows.
 */
export function formatProjectList(
  list: ProjectList,
  opts: FormatOptions = {}
): string {
  const {
    query,
    sector: sectorFilter,
    includeUrls = false,
    baseUrl = 'https://lanhuapp.com',
    includeLinks = true,
    teamId,
    projectId
  } = opts;

  const imageById = new Map(list.images.map(img => [img.id, img]));
  const q = query?.trim().toLowerCase();
  const sf = sectorFilter?.trim().toLowerCase();

  const matchQuery = (img: DesignListItem) =>
    !q || img.name.toLowerCase().includes(q);

  const lines: string[] = [];
  if (list.projectName) lines.push(`项目：${list.projectName}`);

  const shownImageIds = new Set<string>();

  // Build a parent->children sector map.
  const childrenOf = new Map<string, SectorGroup[]>();
  for (const sec of list.sectors) {
    const key = sec.parentId || '';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(sec);
  }
  // Sort each level by order desc (matches Lanhu drag ordering).
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => b.order - a.order);
  }

  const sectorImgs = (sec: SectorGroup): DesignListItem[] =>
    sec.imageIds
      .map(id => imageById.get(id))
      .filter((img): img is DesignListItem => Boolean(img && matchQuery(img)));

  // Does this sector or any descendant contain matching images?
  const subtreeCache = new Map<string, boolean>();
  const subtreeHasMatch = (sec: SectorGroup): boolean => {
    const cached = subtreeCache.get(sec.id);
    if (cached !== undefined) return cached;
    const own = sectorImgs(sec).length > 0;
    const kids = childrenOf.get(sec.id) || [];
    const result = own || kids.some(k => subtreeHasMatch(k));
    subtreeCache.set(sec.id, result);
    return result;
  };

  const emitSector = (sec: SectorGroup, depth: number): void => {
    // With a sector filter, only that sector's subtree is emitted.
    if (sf && !sec.name.toLowerCase().includes(sf)) return;
    // With a query, prune branches that have no matching images anywhere.
    if (q && !subtreeHasMatch(sec)) return;

    const imgs = sectorImgs(sec);
    lines.push(`${'#'.repeat(2 + depth)} ${sec.name} (${imgs.length})`);
    for (const img of imgs) {
      lines.push(
        formatImageLine(img, {
          includeUrls,
          baseUrl,
          includeLinks,
          teamId,
          projectId
        })
      );
      shownImageIds.add(img.id);
    }
    const kids = childrenOf.get(sec.id) || [];
    for (const kid of kids) emitSector(kid, depth + 1);
  };

  // Top-level sectors: no parent, or parent filtered out.
  const topLevel = (childrenOf.get('') || []).filter(sec => {
    if (sf && !sec.name.toLowerCase().includes(sf)) return false;
    if (q && !subtreeHasMatch(sec)) return false;
    return true;
  });
  for (const sec of topLevel) emitSector(sec, 0);

  // Images that belong to no emitted sector.
  const ungrouped = list.images.filter(
    img => !shownImageIds.has(img.id) && matchQuery(img)
  );
  if (!sf && ungrouped.length > 0) {
    lines.push(`## 未分组 (${ungrouped.length})`);
    for (const img of ungrouped) {
      lines.push(
        formatImageLine(img, {
          includeUrls,
          baseUrl,
          includeLinks,
          teamId,
          projectId
        })
      );
    }
  }

  const total = list.images.length;
  const shown = shownImageIds.size + (sf ? 0 : ungrouped.length);
  lines.push(
    `\n共 ${total} 张设计稿，显示 ${shown} 张${
      list.hasNext ? '（has_next=true，存在分页，更多结果需后续请求）' : ''
    }`
  );
  return lines.join('\n');
}

function formatImageLine(
  img: DesignListItem,
  opts: {
    includeUrls: boolean;
    baseUrl: string;
    includeLinks: boolean;
    teamId?: string;
    projectId?: string;
  }
): string {
  const { includeUrls, baseUrl, includeLinks, teamId, projectId } = opts;
  const size =
    img.width != null && img.height != null
      ? `${round1(img.width)}×${round1(img.height)}`
      : '';
  const dds = img.ddsReady ? '✓' : '✗';
  const time = img.updateTime ? img.updateTime.slice(0, 10) : '';
  const detailUrl =
    includeLinks && teamId && projectId
      ? `${baseUrl}/web/#/item/project/detailDetach?tid=${teamId}&pid=${projectId}&image_id=${img.id}`
      : '';
  const parts = [
    `- ${img.name}`,
    size && `(${size})`,
    `dds:${dds}`,
    time && time,
    includeUrls && img.url && `<${img.url}>`,
    detailUrl && `→ ${detailUrl}`
  ].filter(Boolean);
  return parts.join(' ');
}

function round1(n: number): string {
  return String(Math.round(n * 10) / 10);
}
