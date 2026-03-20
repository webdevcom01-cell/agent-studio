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
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>;
    setex(key: string, seconds: number, value: string): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    quit(): Promise<void>;
    status: string;
  }

  export default Redis;
}
