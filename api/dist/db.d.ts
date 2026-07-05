export declare let dbReady: boolean;
export interface DbClient {
    query(sqlStr: string, params?: any[]): Promise<{
        rows: any[];
        rowCount: number | null;
    }>;
    get<T extends Record<string, any> = any>(sqlStr: string, params?: any[]): Promise<T | undefined>;
    all<T extends Record<string, any> = any>(sqlStr: string, params?: any[]): Promise<T[]>;
    run(sqlStr: string, params?: any[]): Promise<{
        lastID: number;
        changes: number;
    }>;
}
export declare const db: DbClient;
/** Fire-and-forget DB write that never throws — use for non-critical writes like chunk persistence */
export declare function dbWriteSafe(sqlStr: string, params?: any[]): Promise<void>;
export declare function getDb(): Promise<DbClient>;
export declare function initDb(): Promise<void>;
//# sourceMappingURL=db.d.ts.map