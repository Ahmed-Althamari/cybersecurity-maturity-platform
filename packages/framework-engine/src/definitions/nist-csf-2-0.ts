import { assertValidFrameworkDefinition } from '../validator';
import type { FrameworkDefinition } from '../types';
import nistCsf2_0Raw from './nist-csf-2.0.json';

/**
 * NIST Cybersecurity Framework (CSF) 2.0 core, as a framework-agnostic
 * `FrameworkDefinition` (ADR-006): 6 Functions, 22 Categories, and all 106
 * Subcategory outcomes, published February 26, 2024 (NIST CSWP 29,
 * https://doi.org/10.6028/NIST.CSWP.29).
 *
 * Data provenance: the CSF 2.0 Core and its Implementation Examples are
 * public domain, sourced from NIST's own Cybersecurity and Privacy
 * Reference Tool (CPRT, https://csrc.nist.gov/projects/cprt). This file was
 * transcribed from a structured export of that data — see
 * `nist-csf-2.0.json` in this directory — because this codebase's sandbox
 * could not reach nist.gov/csrc.nist.gov directly at authoring time.
 * `assertValidFrameworkDefinition` below re-validates the data's shape and
 * structural integrity (unique codes, non-empty hierarchy) on every import,
 * and the accompanying test asserts the official totals (6/22/106); anyone
 * relying on this for a real compliance assessment should still spot-check
 * outcome wording against the authoritative NIST publication.
 *
 * One question is auto-generated per subcategory from its outcome text
 * (NIST CSF itself has no separate "question" concept); the subcategory's
 * official Implementation Examples are carried as that question's
 * `examples`, for assessor guidance.
 */
export const NIST_CSF_2_0: FrameworkDefinition = assertValidFrameworkDefinition(nistCsf2_0Raw);
