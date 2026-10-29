export function serve(handler: (req: Request) => Response | Promise<Response>) { (globalThis as any).__lastHandler = handler; }
