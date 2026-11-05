import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMcpServer } from '../../mcp.ts';
import * as promptsEnUS from '../../prompts/en-US.ts';
import * as promptsZhCN from '../../prompts/zh-CN.ts';
import * as lanhuApi from '../../services/lanhu-api.ts';
import * as projectList from '../../utils/project-list.ts';
import * as urlParser from '../../utils/url-parser.ts';
import { registerListProjectDesigns } from '../list-project-designs.ts';
import type { ServerConfig } from '../../config.ts';

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    lanhuToken: 'token',
    ddsToken: 'token',
    httpTimeout: 30_000,
    port: 5200,
    host: '127.0.0.1',
    isHttpMode: false,
    isStdioMode: true,
    tailwindcss: false,
    twVersion: 3,
    skipSlices: false,
    unitScale: 2,
    promptLang: 'en-US',
    ...overrides
  };
}

function createToolHarness(config: Partial<ServerConfig> = {}) {
  let handler:
    | ((args: {
        url: string;
        query?: string;
        sector?: string;
        includeUrls?: boolean;
      }) => Promise<Record<string, unknown>>)
    | undefined;
  const server = {
    registerTool: vi.fn(
      (
        _name: string,
        _schema: Record<string, unknown>,
        h: (args: {
          url: string;
          query?: string;
          sector?: string;
          includeUrls?: boolean;
        }) => Promise<Record<string, unknown>>
      ) => {
        handler = h;
      }
    )
  };

  registerListProjectDesigns({
    server: server as never,
    config: makeConfig(config)
  });

  return {
    handler: handler!,
    server
  };
}

async function setupClientServer(cfg?: Partial<ServerConfig>) {
  const server = createMcpServer(makeConfig(cfg));
  const client = new Client({ name: 'lanhu-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);
  return { server, client };
}

function callTool(client: Client, name: string, args: Record<string, unknown>) {
  return client.request(
    { method: 'tools/call', params: { name, arguments: args } },
    CallToolResultSchema
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('list_project_designs — protocol', () => {
  test('tool is registered alongside get_design_context', async () => {
    const { client } = await setupClientServer();
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('list_project_designs');
    expect(names).toContain('get_design_context');
    await client.close();
  });

  test('schema exposes url required + optional filters', async () => {
    const { client } = await setupClientServer();
    const { tools } = await client.listTools();
    const tool = tools.find(t => t.name === 'list_project_designs')!;
    const props = tool.inputSchema.properties as Record<string, unknown>;
    expect(props).toHaveProperty('url');
    expect(props).toHaveProperty('query');
    expect(props).toHaveProperty('sector');
    expect(props).toHaveProperty('includeUrls');
    expect(tool.inputSchema.required).toEqual(['url']);
    await client.close();
  });

  test('zh-CN description when promptLang=zh-CN', async () => {
    const { client } = await setupClientServer({ promptLang: 'zh-CN' });
    const { tools } = await client.listTools();
    const tool = tools.find(t => t.name === 'list_project_designs')!;
    expect(tool.description).toContain('蓝湖');
    await client.close();
  });
});

describe('list_project_designs — handler', () => {
  test('returns a stop instruction when URL parsing fails', async () => {
    const { handler } = createToolHarness({ promptLang: 'en-US' });
    vi.spyOn(urlParser, 'parseLanhuParams').mockImplementation(() => {
      throw new Error('bad-url');
    });

    const result = await handler({ url: 'https://example.com' });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: `bad-url${promptsEnUS.ERROR_STOP_INSTRUCTION}`
      }
    ]);
  });

  test('missing tid produces a stop error mentioning tid', async () => {
    const { client } = await setupClientServer({ promptLang: 'en-US' });
    const result = await callTool(client, 'list_project_designs', {
      url: 'https://lanhuapp.com/web/#/item/project/stage?pid=p1'
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('tid');
    expect(text).toContain(promptsEnUS.ERROR_STOP_INSTRUCTION);
    await client.close();
  });

  test('missing pid produces a stop error mentioning pid', async () => {
    const { client } = await setupClientServer({ promptLang: 'zh-CN' });
    const result = await callTool(client, 'list_project_designs', {
      url: 'https://lanhuapp.com/web/#/item/project/stage?tid=t1'
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('pid');
    expect(text).toContain(promptsZhCN.ERROR_STOP_INSTRUCTION);
    await client.close();
  });

  test('stop instruction when getProjectImages fails', async () => {
    const { handler } = createToolHarness({ promptLang: 'en-US' });
    vi.spyOn(urlParser, 'parseLanhuParams').mockReturnValue({
      teamId: 'team-1',
      projectId: 'project-1',
      docId: undefined,
      versionId: undefined
    });
    vi.spyOn(lanhuApi, 'getProjectImages').mockRejectedValue(
      new Error('images-broken')
    );
    vi.spyOn(lanhuApi, 'getProjectSectors').mockResolvedValue([]);

    const result = await handler({ url: 'https://example.com' });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: `images-broken${promptsEnUS.ERROR_STOP_INSTRUCTION}`
      }
    ]);
  });

  test('stop instruction when getProjectSectors fails', async () => {
    const { handler } = createToolHarness({ promptLang: 'en-US' });
    vi.spyOn(urlParser, 'parseLanhuParams').mockReturnValue({
      teamId: 'team-1',
      projectId: 'project-1',
      docId: undefined,
      versionId: undefined
    });
    vi.spyOn(lanhuApi, 'getProjectImages').mockResolvedValue({
      name: 'P',
      images: [],
      hasNext: false
    });
    vi.spyOn(lanhuApi, 'getProjectSectors').mockRejectedValue(
      new Error('sectors-broken')
    );

    const result = await handler({ url: 'https://example.com' });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: `sectors-broken${promptsEnUS.ERROR_STOP_INSTRUCTION}`
      }
    ]);
  });

  test('happy path returns formatted markdown', async () => {
    const { handler } = createToolHarness({ promptLang: 'en-US' });
    vi.spyOn(urlParser, 'parseLanhuParams').mockReturnValue({
      teamId: 'team-1',
      projectId: 'project-1',
      docId: undefined,
      versionId: undefined
    });
    const getProjectImagesSpy = vi
      .spyOn(lanhuApi, 'getProjectImages')
      .mockResolvedValue({
        name: 'Demo Project',
        images: [
          {
            id: 'img-1',
            name: 'Home',
            width: 375,
            height: 812,
            update_time: '2026-01-01T00:00:00Z',
            dds_jump_status: 1,
            latest_version: 'v-1'
          }
        ],
        hasNext: false
      });
    const getProjectSectorsSpy = vi
      .spyOn(lanhuApi, 'getProjectSectors')
      .mockResolvedValue([
        {
          id: 'sec-1',
          parent_id: '',
          name: '核心流程',
          order: 100,
          images: ['img-1']
        }
      ]);
    const formatSpy = vi
      .spyOn(projectList, 'formatProjectList')
      .mockReturnValue('## Demo\n- Home');

    const result = await handler({
      url: 'https://example.com',
      query: 'home',
      sector: '核心',
      includeUrls: true
    });

    expect(getProjectImagesSpy).toHaveBeenCalledWith({
      teamId: 'team-1',
      projectId: 'project-1'
    });
    expect(getProjectSectorsSpy).toHaveBeenCalledWith({
      teamId: 'team-1',
      projectId: 'project-1'
    });
    expect(formatSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'Demo Project',
        images: expect.arrayContaining([
          expect.objectContaining({ id: 'img-1', name: 'Home' })
        ]),
        sectors: expect.arrayContaining([
          expect.objectContaining({ id: 'sec-1', name: '核心流程' })
        ])
      }),
      expect.objectContaining({
        query: 'home',
        sector: '核心',
        includeUrls: true,
        teamId: 'team-1',
        projectId: 'project-1'
      })
    );
    expect(result.content).toEqual([{ type: 'text', text: '## Demo\n- Home' }]);
  });
});
