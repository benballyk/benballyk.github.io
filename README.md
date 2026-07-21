# benballyk.github.io

Personal website of Benjamin Ballyk, PhD student in Engineering Science (Robotics) at the University of Oxford.

Built as a Jekyll site and served directly by GitHub Pages.

## Structure

- `index.html`: homepage (About, Research, Publications, Updates)
- `blog.html` + `_posts/`: blog. Add a new post by dropping a file in `_posts/` named `YYYY-MM-DD-title.md` with front matter:
  ```
  ---
  layout: post
  title: "Post title"
  date: 2026-07-20
  ---
  Post content in Markdown.
  ```
- `_layouts/`: page templates
- `_data/publications.yml` and `_data/news.yml`: structured homepage content
- `assets/css/style.css`: styling
- `assets/img/ben-ballyk.jpg`: profile photo

## Local preview (optional)

```
bundle install
bundle exec jekyll serve
```
