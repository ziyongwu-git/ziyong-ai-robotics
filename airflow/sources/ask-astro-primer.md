---
title: "Ask Astro primer"
source_url: "https://github.com/astronomer/ask-astro"
---

# Ask Astro primer

This file is input for the sample DAG in `airflow/dags/build_notebook_index.py`.
It is not a page on the website. The facts follow the Ask Astro README and the Airflow docs linked from the project page.

## What Ask Astro is

Ask Astro is an open-source question-answering application built by Astronomer. It answers questions about Apache Airflow and Astronomer. The repository describes Airflow DAGs that retrieve and embed documents, an API that turns a prompt into a reply, and feedback DAGs.

## Ingest

The ingest DAGs pull a source, split the text into chunks, embed the chunks, and write the vectors to Weaviate. The README lists the Airflow docs, Astronomer docs, the Astronomer blog, the Astronomer Registry, Airflow GitHub pull requests, OpenLineage, and a Stack Overflow dump. The bulk DAG can save extracted documents as parquet so a later run can try a new chunk size.

## Question time and feedback

At question time the README describes reworded prompts, a Weaviate search, a Cohere rerank, a relevance check, and a final model call. Feedback DAGs can write a good question and answer back into Weaviate.

## What the sample DAG does instead

This sample counts terms. It does not call an embedding model and it does not open a network connection. The score function is where an embedding call would go in a real ingest DAG.
