# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

# Minimal makefile for Sphinx documentation
#

# You can set these variables from the command line, and also
# from the environment for the first two.
SPHINXOPTS    ?=
SPHINXBUILD  ?= sphinx-build
SOURCEDIR    = source
BUILDDIR     = _build

# Put it first so that "make" without argument is like "make help".
help:
	@$(SPHINXBUILD) -M help "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)

.PHONY: help Makefile

# Common development targets
install:
	pip install -r requirements.txt

clean:
	@$(SPHINXBUILD) -M clean "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)
	rm -rf $(BUILDDIR)

html:
	@$(SPHINXBUILD) -M html "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)

pdf:
	@$(SPHINXBUILD) -M latexpdf "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)

# Live reload for development
livehtml:
	sphinx-autobuild -b html $(SPHINXOPTS) "$(SOURCEDIR)" "$(BUILDDIR)/html"

# Check for broken links
linkcheck:
	@$(SPHINXBUILD) -M linkcheck "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)

# Spell check (requires sphinxcontrib-spelling)
spelling:
	@$(SPHINXBUILD) -b spelling $(SPHINXOPTS) "$(SOURCEDIR)" "$(BUILDDIR)/spelling"

# Generate compliance documentation as PDF
compliance-pdf:
	@$(SPHINXBUILD) -b latex -t compliance $(SPHINXOPTS) "$(SOURCEDIR)" "$(BUILDDIR)/compliance-latex"
	@cd "$(BUILDDIR)/compliance-latex" && make all-pdf
	@echo "Compliance PDF generated in $(BUILDDIR)/compliance-latex/"

# Validate RST syntax
validate:
	rstcheck --recursive .

# Build for production deployment
production: clean html pdf
	@echo "Production documentation built successfully"
	@echo "HTML: $(BUILDDIR)/html/"
	@echo "PDF: $(BUILDDIR)/latex/"

# Development server with live reload
serve: livehtml

# Run all quality checks
check: validate linkcheck spelling
	@echo "All documentation checks completed"

# Quick development build (HTML only)
dev: html
	@echo "Development build completed: $(BUILDDIR)/html/index.html"
	@echo "Open in browser: file://$(PWD)/$(BUILDDIR)/html/index.html"

# Catch-all target: route all unknown targets to Sphinx using the new
# "make mode" option.  $(O) is meant as a shortcut for $(SPHINXOPTS).
%: Makefile
	@$(SPHINXBUILD) -M $@ "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O) 
