// @ts-nocheck
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { migrationEnvironment, runCandidateMigrations } from '../ops/run-migrations.mjs';

const fixture = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cruush-migration-job-'));
  const file = path.join(dir, 'migration.env');
  writeFileSync(file, 'DATABASE_URL=postgresql://fixture:synthetic@127.0.0.1/fixture\nSESSION_SECRET=synthetic-session-key-not-used-for-real-data\nLOCATION_ENCRYPTION_KEY=synthetic-location-key-not-used-for-real-data\n', {mode:0o600});
  return {dir,file};
};

describe('candidate migration isolation', () => {
  it('passes only migration fields to a fresh child environment', () => {
    const f=fixture();
    try {
      process.env.RESEND_API_KEY='synthetic-must-not-leak';
      let invocation;
      expect(runCandidateMigrations({file:f.file,run:(...args)=>{invocation=args;return {status:0};}})).toBe(true);
      expect(invocation[1]).toEqual(['--enable-source-maps','/app/dist/migrate.js']);
      expect(Object.keys(invocation[2].env).sort()).toEqual(['DATABASE_URL','LOCATION_ENCRYPTION_KEY','NODE_ENV','SESSION_SECRET']);
      expect(invocation[2].env.NODE_ENV).toBe('production');
      expect(invocation[2].stdio).toEqual(['ignore','pipe','pipe']);
    } finally {delete process.env.RESEND_API_KEY;rmSync(f.dir,{recursive:true,force:true});}
  });
  it('rejects missing, public, symlinked or oversized secret files before executing', () => {
    const f=fixture();let called=false;const run=()=>{called=true;return {status:0};};
    try {
      expect(runCandidateMigrations({file:path.join(f.dir,'missing'),run})).toBe(false);
      const link=path.join(f.dir,'symlink');symlinkSync(f.file,link);expect(runCandidateMigrations({file:link,run})).toBe(false);
      chmodSync(f.file,0o644);expect(runCandidateMigrations({file:f.file,run})).toBe(false);
      chmodSync(f.file,0o600);writeFileSync(f.file,'x'.repeat(65537));expect(runCandidateMigrations({file:f.file,run})).toBe(false);
      expect(called).toBe(false);
    } finally {rmSync(f.dir,{recursive:true,force:true});}
  });
  it('rejects API credentials and incomplete configuration', () => {
    const f=fixture();try {
      writeFileSync(f.file,'DATABASE_URL=postgresql://fixture@127.0.0.1/fixture\nRESEND_API_KEY=synthetic\n');expect(runCandidateMigrations({file:f.file})).toBe(false);
      expect(()=>migrationEnvironment(f.file)).toThrow(/unsupported/);
      writeFileSync(f.file,'DATABASE_URL=postgresql://fixture@127.0.0.1/fixture\nSESSION_SECRET=synthetic\n');expect(runCandidateMigrations({file:f.file})).toBe(false);
    } finally {rmSync(f.dir,{recursive:true,force:true});}
  });
  it.each([{status:1,stderr:'private-password-and-member-data'}, {status:null,signal:'SIGTERM'}, {error:Error('private connection URL')}])('holds deployment on migration failure without emitting child details', result => {
    const f=fixture();try{expect(runCandidateMigrations({file:f.file,run:()=>result})).toBe(false);}finally{rmSync(f.dir,{recursive:true,force:true});}
  });
});

describe('immutable candidate image job', () => {
  it.each([{sha:'a'.repeat(40),migrationExit:0,expected:0},{sha:'b'.repeat(40),migrationExit:0,expected:1},{sha:'a'.repeat(40),migrationExit:7,expected:7}])('pins image and propagates the pre-stop migration gate: %j', row => {
    const f=fixture();try {
      const record=path.join(f.dir,'run.txt');
      writeFileSync(path.join(f.dir,'git'),'#!/bin/sh\necho '+ 'a'.repeat(40)+'\n',{mode:0o700});
      writeFileSync(path.join(f.dir,'docker'),`#!/bin/sh\ncase "$1 $2" in\n'compose --env-file') echo cruush-api:candidate;;\n'image inspect') case "$4" in *APP_BUILD_SHA*) echo ${row.sha};; *) echo sha256:${'c'.repeat(64)};; esac;;\n'run --rm') echo "$*" > "${record}"; exit ${row.migrationExit};;\n*) exit 90;;\nesac\n`,{mode:0o700});
      const result=spawnSync('sh',['ops/migrate-built-api.sh','compose.v2.yml','a'.repeat(40),'syntheticapi'],{cwd:path.resolve('.'),env:{PATH:f.dir+':'+process.env.PATH},encoding:'utf8'});
      expect(result.status).toBe(row.expected);
      if(row.sha==='a'.repeat(40)) {
        const args=readFileSync(record,'utf8');
        expect(args).toContain('sha256:'+ 'c'.repeat(64));expect(args).toContain('src=/opt/cruush-migration-private/migration-syntheticapi.env,dst=/run/cruush/migration.env,readonly');expect(args).not.toContain('--env-file');
      }
    } finally {rmSync(f.dir,{recursive:true,force:true});}
  });
});
