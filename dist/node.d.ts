import { TransformOptions } from 'esbuild';

declare const FILE_LOADERS: {
    readonly '.js': "js";
    readonly '.jsx': "jsx";
    readonly '.ts': "ts";
    readonly '.tsx': "tsx";
    readonly '.mjs': "js";
    readonly '.binary': "binary";
    readonly '.txt': "text";
};
declare type EXTENSIONS = keyof typeof FILE_LOADERS;
interface RegisterOptions extends TransformOptions {
    extensions?: EXTENSIONS[];
    /**
     * Auto-ignore node_modules. Independent of any matcher.
     * @default true
     */
    hookIgnoreNodeModules?: boolean;
    /**
     * A matcher function, will be called with path to a file. Should return truthy if the file should be hooked, falsy otherwise.
     */
    hookMatcher?(fileName: string): boolean;
}
declare function register(esbuildOptions?: RegisterOptions): {
    unregister(): void;
};
declare type Register = ReturnType<typeof register>;

export { Register, register };
