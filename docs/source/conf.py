# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = 'SYNDI'
copyright = '2025, Pathway Bio'
author = 'Kimberly Robasky (krobasky@gmail.com)'
release = '1.0.0'
version = '1.0'

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = [
    'sphinx.ext.autodoc',
    'sphinx.ext.viewcode',
    'sphinx.ext.napoleon',
    'sphinx.ext.intersphinx',
    'sphinx.ext.todo',
    'sphinx.ext.coverage',
    'sphinx.ext.ifconfig',
    'sphinx.ext.githubpages',
    'myst_parser',  # For Markdown support
    'sphinxcontrib.mermaid',  # For Mermaid diagram support
]

# Add any paths that contain templates here, relative to this directory.
templates_path = ['_templates']

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

# The suffix(es) of source filenames.
source_suffix = {
    '.rst': 'restructuredtext',
    '.md': 'markdown',
}

# MyST parser configuration
myst_enable_extensions = [
    "colon_fence",
    "deflist",
    "tasklist",
]

# Mermaid configuration
mermaid_output_format = 'raw'
mermaid_init_js = "mermaid.initialize({startOnLoad:true});"

# MyST fence configuration for code blocks
myst_fence_as_directive = [
    "mermaid",
]

# The master toctree document.
master_doc = 'index'

# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output

html_theme = 'furo' #'sphinx_rtd_theme'
html_static_path = ['_static']

# Theme options for different sections
html_theme_options = {
    "light_logo": "logo-light-long.png",
    "dark_logo": "logo-light-long.png",
}

# Custom sidebars for different sections
html_sidebars = {
    'api/**': ['searchbox.html', 'localtoc.html'],
    'compliance/**': ['searchbox.html', 'localtoc.html'],
    'user-guides/**': ['searchbox.html', 'localtoc.html'],
    'developer-guides/**': ['searchbox.html', 'localtoc.html']
}

# Add custom CSS
html_css_files = [
    'custom.css',
]

# Add custom JavaScript for Mermaid
html_js_files = [
    ('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js', {'async': 'async'}),
]

# -- Extension configuration -------------------------------------------------

# Napoleon settings for Google/NumPy style docstrings
napoleon_google_docstring = True
napoleon_numpy_docstring = True
napoleon_include_init_with_doc = False
napoleon_include_private_with_doc = False
napoleon_include_special_with_doc = True
napoleon_use_admonition_for_examples = False
napoleon_use_admonition_for_notes = False
napoleon_use_admonition_for_references = False
napoleon_use_ivar = False
napoleon_use_param = True
napoleon_use_rtype = True

# Autodoc settings
autodoc_default_options = {
    'members': True,
    'member-order': 'bysource',
    'special-members': '__init__',
    'undoc-members': True,
    'exclude-members': '__weakref__'
}

# Todo extension settings
todo_include_todos = True

# Intersphinx mapping
intersphinx_mapping = {
    'python': ('https://docs.python.org/3/', None),
    'django': ('https://docs.djangoproject.com/en/stable/', 'https://docs.djangoproject.com/en/stable/_objects/'),
    'requests': ('https://requests.readthedocs.io/en/stable/', None),
}

# -- PDF output configuration ------------------------------------------------
latex_elements = {
    'papersize': 'letterpaper',
    'pointsize': '10pt',
    'preamble': r'''
        \usepackage{charter}
        \usepackage[defaultsans]{lato}
        \usepackage{inconsolata}
    ''',
}

latex_documents = [
    (master_doc, 'LabDataCapture.tex', 'Laboratory Data Capture System Documentation',
     'Lab Data Capture Team', 'manual'),
]

# Grouping the document tree into LaTeX files for compliance
latex_documents.extend([
    ('compliance/index', 'ComplianceDocumentation.tex', 
     'CLIA and CFR Part 11 Compliance Documentation',
     'Lab Data Capture Team', 'manual'),
]) 
