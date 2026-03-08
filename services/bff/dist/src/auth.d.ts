export declare const authRouter: import("express-serve-static-core").Router;
declare module "express-session" {
    interface SessionData {
        user?: {
            id: string;
            email: string;
            name?: string;
            picture?: string;
            role: "admin" | "manager" | "rep";
        };
        state?: string;
    }
}
