import { Request, Response, NextFunction } from 'express';
export declare const JWT_SECRET: string;
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        tenantId?: string;
    };
    tenant?: {
        id: string;
        slug: string;
        name: string;
        primary_color: string;
        logo_url?: string;
        custom_domain?: string;
        plan: string;
        status: string;
    };
    tenantId?: string;
}
export declare function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
export declare function requireRole(...roles: string[]): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export declare function resolveTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.d.ts.map