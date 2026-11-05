import { z } from 'zod';
import * as promptsEnUS from '../prompts/en-US.ts';
import * as promptsZhCN from '../prompts/zh-CN.ts';
import { getProjectImages, getProjectSectors } from '../services/lanhu-api.ts';
import { buildProjectList, formatProjectList } from '../utils/project-list.ts';
import { formatStopError } from '../utils/stop-instruction.ts';
import { parseLanhuParams } from '../utils/url-parser.ts';
import type { ServerConfig } from '../types/config.ts';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type ContentItem = { type: 'text'; text: string };

const LIST_DESCRIPTIONS = {
  'en-US':
    'List all design images in a Lanhu project. Returns project name, sector groups, and every design image (name, size, dds status, updated time, detail link for use with get_design_context). Use query/sector to filter large lists.',
  'zh-CN':
    '列出蓝湖项目中的全部设计稿。返回项目名、分组结构以及每张设计稿的名称、尺寸、转码状态、更新时间和可传给 get_design_context 的详情链接。可用 query/sector 过滤大列表。'
} as const;

const PARAM_DESCRIPTIONS = {
  'en-US': {
    url: 'Any Lanhu project URL containing tid and pid (or project_id). Works for stage page URLs like /item/project/stage?tid=...&pid=...',
    query:
      'Case-insensitive substring filter on design name. Use this for large projects to keep the result small.',
    sector:
      'Filter output to a single sector/group whose name contains this value (case-insensitive).',
    includeUrls:
      'Include raw preview image URLs in the output. Default false to keep the list compact.'
  },
  'zh-CN': {
    url: '包含 tid 和 pid（或 project_id）的蓝湖项目链接，例如 stage 页面链接 /item/project/stage?tid=...&pid=...',
    query: '按设计稿名称做不区分大小写的子串过滤。大项目建议用它缩小结果。',
    sector: '只输出分组名包含该值的分组（不区分大小写子串匹配）。',
    includeUrls: '是否在输出中带上原图预览地址。默认 false 以保持列表紧凑。'
  }
} as const;

export function registerListProjectDesigns({
  server,
  config
}: {
  server: McpServer;
  config: ServerConfig;
}): void {
  const desc =
    LIST_DESCRIPTIONS[config.promptLang] ?? LIST_DESCRIPTIONS['en-US'];
  const pd =
    PARAM_DESCRIPTIONS[config.promptLang] ?? PARAM_DESCRIPTIONS['en-US'];
  const stopInstruction =
    config.promptLang === 'zh-CN'
      ? promptsZhCN.ERROR_STOP_INSTRUCTION
      : promptsEnUS.ERROR_STOP_INSTRUCTION;

  server.registerTool(
    'list_project_designs',
    {
      description: desc,
      inputSchema: {
        url: z.string().describe(pd.url),
        query: z.string().optional().describe(pd.query),
        sector: z.string().optional().describe(pd.sector),
        includeUrls: z.boolean().optional().describe(pd.includeUrls)
      }
    },
    async ({ url, query, sector, includeUrls }) => {
      let teamId: string;
      let projectId: string;
      try {
        const params = parseLanhuParams(url);
        teamId = params.teamId;
        projectId = params.projectId;
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: formatStopError(error, stopInstruction)
            }
          ]
        };
      }

      try {
        const [imagesResult, sectors] = await Promise.all([
          getProjectImages({ teamId, projectId }),
          getProjectSectors({ teamId, projectId })
        ]);

        const list = buildProjectList(imagesResult, sectors);
        const text = formatProjectList(list, {
          query,
          sector,
          includeUrls,
          includeLinks: true,
          teamId,
          projectId
        });

        const content: ContentItem[] = [{ type: 'text', text }];
        return { content };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: formatStopError(error, stopInstruction)
            }
          ]
        };
      }
    }
  );
}
