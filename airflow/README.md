# Sample Airflow DAG

This folder is a picture of how the "Ask the notebook" index could be built with a real DAG. It is not part of the website.

`npm run build` does not run it. Vercel does not deploy it. The page at `/demos/ask-the-notebook` already contains a small curated set of passages and searches them in the browser. Nothing here is imported by Astro.

## What it does

`dags/build_notebook_index.py` has four steps, the same shape as Ask Astro's ingest:

1. **Extract.** Read markdown from `src/content/learning/`, `src/content/projects/`, and `airflow/sources/`.
2. **Chunk.** Split on headings and merge tiny pieces.
3. **Score.** Count words. Ask Astro would call an embedding model here and upsert vectors into Weaviate. This step does not.
4. **Write.** Save `airflow/output/notebook-index.json`. That output directory is gitignored.

There is no API key, no network call, and no vector database. The file uses the Python standard library.

`sources/ask-astro-primer.md` is extra input so the DAG has a short Ask Astro passage to chunk. It is not a page on the site.

## Run it without Airflow

From the repository root:

```bash
python airflow/dags/build_notebook_index.py
```

You should see `airflow/output/notebook-index.json`. Open it. Each chunk has a title, a link, the text, and term counts.

## Run it with Airflow

If Apache Airflow is installed, importing the module registers a DAG named `build_notebook_index`. Put the repo's `airflow/dags` folder on the DAG path, or copy the file into your DAGs folder, then:

```bash
airflow dags test build_notebook_index
```

The tasks call the same functions as the plain Python path. Still no model, and still no credentials. The comment in `score_chunks` is the line you would replace if you were building the real embedding step. Do not put a key in the file.

The website's passages are hand-written in `src/components/demos/notebook.ts` so the demo stays readable. They are not generated from this JSON. If you change a note and want the DAG's output to match, run the script again. The browser demo will not pick up that file on its own.
