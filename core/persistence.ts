import { configSchema, type Config } from "./schema";

// Exact picks retain their selector; DOM handles belong to a single document.
export function durableConfig(config: Config): Config {
  return configSchema.parse({
    ...config,
    rules: config.rules.map(({ handle, ...rule }) => ({
      ...rule,
      targets: rule.targets?.map((target) =>
        target.kind === "exact"
          ? { kind: target.kind, selector: target.selector }
          : target,
      ),
    })),
  });
}
