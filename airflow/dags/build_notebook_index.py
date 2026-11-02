"""Build a JSON index the way an Airflow DAG would.

The website does not run this file. `npm run build` never imports it, and
the Vercel deploy does not need it. The page at /projects/ask-the-notebook
replays the same shape in the browser, with a smaller curated set of
passages that ships inside the page.

Two ways to run it, both without an API key:

1. Standard library only, from the repo root:

     python airflow/dags/build_notebook_index.py

   Writes airflow/output/notebook-index.json. That folder is gitignored.

2. If Apache Airflow is installed, importing this module also registers a
   DAG named build_notebook_index. The tasks call the functions below.
   Trigger it from the UI, or:

     airflow dags test build_notebook_index

The score step counts words. In Ask Astro the matching step calls an
embedding model and upserts vectors into Weaviate. The comment in
score_chunks marks that spot. Do not add a secret here. This sample is
meant to run with no credentials at all.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "airflow" / "output" / "notebook-index.json"

# Markdown the DAG is allowed to read. The site build does not use this list.
SOURCE_DIRS = (
    ROOT / "src" / "content" / "learning",
    ROOT / "src" / "content" / "projects",
    ROOT / "airflow" / "sources",
)


def extract_documents() -> list[dict]:
    """Read markdown files and return plain text plus a site path or URL."""
    documents = []
    for folder in SOURCE_DIRS:
        if not folder.exists():
            continue
        for path in sorted(folder.glob("*.md")) + sorted(folder.glob("*.mdx")):
            documents.append(read_document(path))
    return documents


def read_document(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    meta, body = split_frontmatter(raw)
    text = strip_mdx(body)
    title = meta.get("title") or first_heading(text) or path.stem
    return {
        "title": title,
        "href": href_for(path, meta),
        "source": str(path.relative_to(ROOT)),
        "text": text.strip(),
    }


def chunk_documents(documents: list[dict]) -> list[dict]:
    """Split each document on headings, then merge tiny pieces.

    Ask Astro uses LangChain splitters so a chunk is small enough to embed.
    A heading split is the readable version of that idea.
    """
    chunks = []
    for document in documents:
        for index, piece in enumerate(pieces_of(document["text"]), start=1):
            chunks.append(
                {
                    "id": f"{slug(document['source'])}-{index}",
                    "title": document["title"],
                    "href": document["href"],
                    "source": document["source"],
                    "text": piece,
                }
            )
    return chunks


def score_chunks(chunks: list[dict]) -> list[dict]:
    """Count terms. This is the stand-in for an embedding call.

    A real ingest task, the kind Ask Astro runs, would call an embedding
    model here and write vectors to Weaviate. This function only counts
    words so the sample stays runnable with no key and no network.
    """
    scored = []
    for chunk in chunks:
        counts: dict[str, int] = {}
        for word in tokenize(chunk["text"]):
            counts[word] = counts.get(word, 0) + 1
        scored.append({**chunk, "terms": counts})
    return scored


def write_index(chunks: list[dict]) -> str:
    """Write the JSON index and return its path as a string.

    Airflow tasks need a return value that can travel as XCom. A path
    string is enough. The website does not read this file.
    """
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "built_by": "build_notebook_index",
        "note": (
            "Term counts stand in for embeddings. Ask Astro would call an "
            "embedding model and upsert the vectors into Weaviate."
        ),
        "chunks": chunks,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return str(OUTPUT.relative_to(ROOT))


def build() -> str:
    """Run the four steps in order. The DAG calls the same functions."""
    documents = extract_documents()
    chunks = chunk_documents(documents)
    scored = score_chunks(chunks)
    return write_index(scored)


def split_frontmatter(raw: str) -> tuple[dict[str, str], str]:
    if not raw.startswith("---"):
        return {}, raw
    end = raw.find("\n---", 3)
    if end == -1:
        return {}, raw
    meta: dict[str, str] = {}
    for line in raw[3:end].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip().strip('"').strip("'")
    return meta, raw[end + 4 :]


def strip_mdx(body: str) -> str:
    """Drop import lines and component tags. Keep the prose."""
    kept = []
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("import "):
            continue
        if stripped.startswith("<") and ("client:" in stripped or stripped.endswith("/>")):
            continue
        kept.append(line)
    return "\n".join(kept)


def first_heading(text: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def href_for(path: Path, meta: dict[str, str]) -> str:
    if "source_url" in meta:
        return meta["source_url"]
    stem = path.stem
    if "content/learning" in path.as_posix():
        return f"/learning/{stem}"
    if "content/projects" in path.as_posix():
        return f"/projects/{stem}"
    return path.as_posix()


def pieces_of(text: str) -> list[str]:
    blocks = re.split(r"\n(?=#{1,3} )", text)
    pieces: list[str] = []
    buffer = ""
    for block in blocks:
        cleaned = re.sub(r"^#{1,3} ", "", block.strip())
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if len(cleaned) < 40:
            continue
        if buffer and len(buffer) + len(cleaned) < 700:
            buffer = f"{buffer} {cleaned}"
        else:
            if buffer:
                pieces.append(buffer)
            buffer = cleaned
    if buffer:
        pieces.append(buffer)
    return pieces


def tokenize(text: str) -> list[str]:
    stop = {
        "a", "an", "the", "is", "are", "of", "to", "and", "or", "for", "in", "on",
        "with", "that", "this", "it", "as", "at", "by", "from", "be",
    }
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [word for word in words if len(word) > 1 and word not in stop]


def slug(source: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", source.lower()).strip("-")


def _register_dag() -> None:
    """Register the DAG only when Airflow is installed.

    Importing airflow at the top would make the no-Airflow path fail.
    The functions above stay plain Python either way.
    """
    try:
        from airflow.sdk import dag, task
    except ImportError:
        try:
            from airflow.decorators import dag, task
        except ImportError:
            return

    @dag(dag_id="build_notebook_index", schedule=None, catchup=False, tags=["notebook", "rag"])
    def build_notebook_index():
        @task
        def extract_task() -> list[dict]:
            return extract_documents()

        @task
        def chunk_task(documents: list[dict]) -> list[dict]:
            return chunk_documents(documents)

        @task
        def score_task(chunks: list[dict]) -> list[dict]:
            return score_chunks(chunks)

        @task
        def write_task(chunks: list[dict]) -> str:
            return write_index(chunks)

        write_task(score_task(chunk_task(extract_task())))

    build_notebook_index()


_register_dag()


if __name__ == "__main__":
    path = build()
    print(path)
