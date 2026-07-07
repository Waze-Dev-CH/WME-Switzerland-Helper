const parserConfig = {
  input: [
    "src/**/*.{js,ts,jsx,tsx}", // or wherever your source lives
    "main.user.ts",
    // The street-name checker owns a dedicated i18next instance whose keys live
    // under streetCheck.* and are maintained by hand; extracting its bare t()
    // calls would dump empty root-level keys into every catalog.
    "!src/street-name-checker/**/*.{js,ts,jsx,tsx}",
  ],
  output: "locales/$LOCALE/common.json",
  locales: ["en", "fr", "de", "it"],
  defaultNamespace: "common",
  keySeparator: ".", // Allows 'asdf' instead of 'a.b.c'
  namespaceSeparator: ":", // 'common:asdf'
  keepRemoved: true, // Don’t delete keys, just add new
  createOldCatalogs: false,
  verbose: true,
};
// eslint-disable-next-line no-undef
module.exports = parserConfig;
