import isolatedDecl from "bun-plugin-isolated-decl"

await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  sourcemap: "external",
  target: "node",
  plugins: [isolatedDecl()],
})
