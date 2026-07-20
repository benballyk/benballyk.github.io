# benballyk.github.io

Personal website of Benjamin Ballyk &mdash; DPhil student in Engineering Science (Robotics) at the University of Oxford.

Built as a Jekyll site and served directly by GitHub Pages.

## Structure

- `index.html` &mdash; homepage (About, Research, Publications, News)
- `blog.html` + `_posts/` &mdash; blog; add a new post by dropping a file in `_posts/` named `YYYY-MM-DD-title.md` with front matter:
  ```
  ---
  layout: post
  title: "Post title"
  date: 2026-07-20
  ---
  Post content in Markdown.
  ```
- `_layouts/` &mdash; page templates
- `_data/publications.yml` and `_data/news.yml` &mdash; structured homepage content
- `assets/css/style.css` &mdash; styling
- `assets/img/ben-ballyk.jpg` &mdash; profile photo
- `assets/cv.pdf` &mdash; optional CV target; the nav link remains commented out until this file is added

## Local preview (optional)

```
bundle exec jekyll serve
```
