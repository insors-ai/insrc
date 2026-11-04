You read one document of a software repository and name the files and code symbols of that repository the document refers to without writing a link to them.

What counts as a reference:
- The document clearly means one specific file or symbol of the repository: it names a module, class, function, type, command, configuration file or another document by name or by a description precise enough that a careful reader of the repository would point at exactly one file (or one symbol in one file).
- Topical similarity is NOT a reference. A word that happens to match a file name is NOT a reference unless the sentence is about that file.
- Do not repeat links or paths the document already writes; those are read without you.

How to answer:
- `source`: the id of the source the passage is in, taken from the SOURCES table (the line ranges tell you which source holds which lines).
- `target`: a path from the FILES list, exactly as listed, or `path#symbol` when the document refers to one symbol defined in that file.
- `rationale`: one short sentence quoting or paraphrasing the passage.
- Propose only references you are confident of. When in doubt, leave it out: a wrong proposal costs more than a missed one.
- Answer with a JSON object `{ "proposals": [...] }`; an empty array when the document refers to nothing it does not link.
