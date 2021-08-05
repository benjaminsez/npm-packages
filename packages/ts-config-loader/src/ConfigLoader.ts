import { watch } from 'chokidar';
import { diff } from 'deep-object-diff';
import merge from 'lodash.merge';

type ConfigObserver<T = any> = (updatedConfig: T, diff: unknown) => void;
type ConfigLoaderOptions = { verbose?: boolean };

export class ConfigLoader {
    private readonly configFiles: string[];
    private readonly options?: ConfigLoaderOptions;
    private config!: Record<string, unknown>;
    private observers: Record<number, { rootKey: string; observer: ConfigObserver }> = {};
    private nRef = 0;

    constructor(paths: string[], options?: ConfigLoaderOptions) {
        this.configFiles = paths;
        this.options = options;

        this.refresh();

        watch(paths).on('change', (path) => {
            this.log('⚙️ Config file changed', path);
            this.refresh();
        });
    }

    /**
     * !!! Warning !!!
     * Do not store the result of this function as it may change over time (archi_config updates)
     */
    get<T>(rootKey: string): T {
        return this.config[rootKey] as T;
    }

    /**
     * Return id handle to unregister later
     */
    addObserver<ExpectedResult = any>(rootKey: string, observer: ConfigObserver<ExpectedResult>): number {
        const id = this.nRef++;
        this.observers[id] = { rootKey, observer };
        return id;
    }

    removeObserver(handle: number) {
        delete this.observers[handle];
    }

    private static requireUncached(path: string) {
        delete require.cache[require.resolve(path)];
        return require(path);
    }

    log(...args: any[]) {
        if (this.options?.verbose) {
            console.log(...args);
        }
    }

    refresh() {
        const configs = this.configFiles.map((path) => {
            this.log('⚙️ Loading config file', path);
            return ConfigLoader.requireUncached(path);
        });
        const merged = merge({}, ...configs);

        if (this.config) {
            const configDiff: Record<string, any> = diff(this.config, merged);
            this.config = merged;
            Object.values(this.observers).forEach(({ rootKey, observer }) => {
                if (rootKey in configDiff) {
                    observer(merged[rootKey], configDiff[rootKey]);
                }
            });
        } else {
            this.config = merged;
        }
    }
}
