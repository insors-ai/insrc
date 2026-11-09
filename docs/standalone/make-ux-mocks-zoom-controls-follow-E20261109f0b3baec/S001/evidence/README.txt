Real pages rendered with headless Chrome from the renderers at source commit 7f22642c8.
ux-mock-*.png: renderCompanionPage with uxDefinitionToPage, covering every card element and all status colours.
docgen-fallback-*.png: assembleFallbackShell with the real svg-pan-zoom bundle.
Each *-dark.png was reached by clicking the page's own theme toggle (#iv-theme) from light.
Not confirmed visually: the primary Mermaid docgen page. Its diagram did not finish rendering in headless Chrome, so its on-diagram controls were not captured. It uses the same shared CSS, asserted in src/docgen/render/__tests__/shell.test.ts.
