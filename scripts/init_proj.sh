#!/usr/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

npm init -y
npm install --save-dev jest ts-jest @types/jest typescript
npx ts-jest config:init
