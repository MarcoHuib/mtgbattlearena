declare module "cloudflare:workers" {
  // Minimal compile-time stand-in for Cloudflare's runtime-provided base class.
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  export class DurableObject<Env = unknown> {
    constructor(ctx: unknown, env: Env)
  }
}
