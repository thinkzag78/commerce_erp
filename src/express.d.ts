import { JwtPayload } from './auth/auth.service';

declare module 'express' {
  interface Request {
    user?: JwtPayload; // your custom property
  }
}
