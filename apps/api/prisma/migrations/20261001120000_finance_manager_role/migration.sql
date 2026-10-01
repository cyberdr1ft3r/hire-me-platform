-- Issue #125: dedicated finance operations role (PostgreSQL enum persistence).
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'finance_manager';
