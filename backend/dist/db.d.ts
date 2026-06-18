import { QueryResult } from 'pg';
export interface DbClient {
    query(sql: string, params?: any[]): Promise<QueryResult>;
    get<T extends Record<string, any> = any>(sql: string, params?: any[]): Promise<T | undefined>;
    all<T extends Record<string, any> = any>(sql: string, params?: any[]): Promise<T[]>;
    run(sql: string, params?: any[]): Promise<{
        lastID: number;
        changes: number;
    }>;
}
export declare const db: {
    query(sql: string, params?: any[]): Promise<QueryResult>;
    get<T extends Record<string, any> = any>(sql: string, params?: any[]): Promise<T | undefined>;
    all<T extends Record<string, any> = any>(sql: string, params?: any[]): Promise<T[]>;
    run(sql: string, params?: any[]): Promise<{
        lastID: number;
        changes: number;
    }>;
};
export declare function getDb(): Promise<DbClient>;
export declare function initDb(): Promise<void>;
//# sourceMappingURL=db.d.ts.map