declare module "ioredis" {
  interface RedisOptions {
    maxRetriesPerRequest?: number | null;
    retryStrategy?: (times: number) => number | null;
    lazyConnect?: boolean;
    connectTimeout?: number;
  }

  class Redis {
    constructor(url: string, options?: RedisOptions);
    connect(): Promise<void>;
    eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
    quit(): Promise<void>;
    status: string;
  }

  export default Redis;
}
