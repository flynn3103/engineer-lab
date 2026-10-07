#!/bin/sh
# Rebuild the downloadable CV from cv/cv.tex (needs: brew install tectonic)
set -e
cd "$(dirname "$0")/../cv" && tectonic -X compile cv.tex && mv cv.pdf ../assets/Linh-Tran-Nhat-CV.pdf && echo "assets/Linh-Tran-Nhat-CV.pdf updated"
