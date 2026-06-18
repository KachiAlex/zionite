import { Request, Response, NextFunction } from 'express';
declare const JWT_SECRET: string;
export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}
export declare function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void;
export declare function requireRole(...roles: string[]): (req: AuthRequest, res: Response, next: NextFunction) => void;
export { JWT_SECRET };
//# sourceMappingURL=auth.d.ts.map