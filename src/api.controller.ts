import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { TenantGuard, TenantRequest } from './tenant.guard';

const projectIn = z.object({ name: z.string().min(1).max(120) });
const noteIn = z.object({ projectId: z.string().uuid(), title: z.string().min(1).max(200), body: z.string().max(10000).default('') });
const uuid = z.string().uuid();

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

/**
 * Notice what is missing: no `where org_id = ...` anywhere. Queries are written as if there were one
 * tenant, and row-level security makes that true. Inserts use app_org() so clients never send an org id.
 */
@Controller()
@UseGuards(TenantGuard)
export class ApiController {
  constructor(private db: Db) {}

  @Post('projects')
  async createProject(@Req() req: TenantRequest, @Body() body: unknown) {
    const { name } = parse(projectIn, body);
    return this.db.withTenant(req.orgId!, async (c) =>
      (await c.query('insert into projects (org_id, name) values (app_org(), $1) returning id, name, created_at', [name])).rows[0]);
  }

  @Get('projects')
  async listProjects(@Req() req: TenantRequest) {
    return this.db.withTenant(req.orgId!, async (c) =>
      (await c.query('select id, name, created_at from projects order by created_at desc limit 100')).rows);
  }

  @Post('notes')
  async createNote(@Req() req: TenantRequest, @Body() body: unknown) {
    const { projectId, title, body: text } = parse(noteIn, body);
    return this.db.withTenant(req.orgId!, async (c) =>
      (await c.query(
        'insert into notes (org_id, project_id, title, body) values (app_org(), $1, $2, $3) returning id, project_id, title, body, created_at',
        [projectId, title, text],
      )).rows[0]);
  }

  @Get('notes')
  async listNotes(@Req() req: TenantRequest, @Query('limit') limit = '50') {
    const n = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    return this.db.withTenant(req.orgId!, async (c) =>
      (await c.query('select id, project_id, title, created_at from notes order by created_at desc limit $1', [n])).rows);
  }

  @Get('notes/:id')
  async getNote(@Req() req: TenantRequest, @Param('id') id: string) {
    parse(uuid, id);
    const row = await this.db.withTenant(req.orgId!, async (c) =>
      (await c.query('select id, project_id, title, body, created_at from notes where id = $1', [id])).rows[0]);
    if (!row) throw new NotFoundException(); // another tenant's note is indistinguishable from a missing one
    return row;
  }

  @Delete('notes/:id')
  async deleteNote(@Req() req: TenantRequest, @Param('id') id: string) {
    parse(uuid, id);
    const row = await this.db.withTenant(req.orgId!, async (c) =>
      (await c.query('delete from notes where id = $1 returning id', [id])).rows[0]);
    if (!row) throw new NotFoundException();
    return { deleted: row.id };
  }

  @Get('me')
  async me(@Req() req: TenantRequest) {
    return this.db.withTenant(req.orgId!, async (c) =>
      (await c.query('select id, name from organizations')).rows[0] ?? null);
  }
}
