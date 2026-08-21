#!/usr/bin/env node
/**
 * Validates content/reviews.json against content/reviews.schema.json rules and
 * reports what the site will actually be able to render (FR-008, FR-009).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const reviewsPath = join(root, 'content', 'reviews.json');
const curation = JSON.parse(readFileSync(join(root, 'content', 'reviews-curation.json'), 'utf8'));

if (!existsSync(reviewsPath)) {
  console.error('Missing content/reviews.json.');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(reviewsPath, 'utf8'));
} catch (error) {
  console.error(`content/reviews.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

/*
 * The export wraps its entries in an object, under `reviews`, alongside the
 * listing it came from. That is what src/lib/reviews.ts reads, so it is what
 * this has to validate. A bare array is still accepted, so a hand trimmed or
 * older file keeps working.
 */
const reviews = Array.isArray(parsed) ? parsed : parsed?.reviews;

if (!Array.isArray(reviews)) {
  console.error('content/reviews.json must be an array, or an object with a reviews array.');
  process.exit(1);
}

if (reviews.length === 0) {
  console.warn('content/reviews.json is empty.');
  console.warn('The homepage curated block, the rating badge and /avis stay in their empty state.');
  console.warn('Drop the 165 review export in to light them up.');
  process.exit(0);
}

const errors = [];
const warnings = [];
const seen = new Set();

reviews.forEach((review, index) => {
  const where = `entry ${index} (id ${review?.id ?? '?'})`;

  const id = String(review?.id ?? '').padStart(3, '0');
  if (!/^\d{3}$/.test(id)) errors.push(`${where}: id must be three digits.`);
  if (seen.has(id)) errors.push(`${where}: duplicate id.`);
  seen.add(id);

  if (!String(review?.reviewer_name ?? '').trim()) errors.push(`${where}: reviewer_name is empty.`);

  const rating = Number(review?.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    errors.push(`${where}: rating must be between 1 and 5.`);
  }

  const text = String(review?.review_fr ?? review?.text ?? '').trim();
  if (!text) errors.push(`${where}: review text is empty.`);

  const iso = String(review?.date_iso ?? '');
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(iso)) {
    warnings.push(`${where}: date_iso is missing or malformed, sorting falls back to the id.`);
  }

  const hasCustomPhoto = review?.has_custom_photo !== false;
  if (hasCustomPhoto) {
    const file = review?.image_filename;
    if (!file) {
      warnings.push(`${where}: has_custom_photo is true but image_filename is missing.`);
    } else if (!existsSync(join(root, 'public', 'images', 'reviews', file))) {
      warnings.push(`${where}: avatar public/images/reviews/${file} is not in the repo yet.`);
    }
  }
});

const ids = new Set([...seen]);
for (const id of curation.homepageCandidateIds) {
  if (!ids.has(id)) warnings.push(`curated id ${id} is not present in the export.`);
}
for (const id of curation.heroQuoteIds) {
  if (!ids.has(id)) warnings.push(`hero quote id ${id} is not present in the export.`);
}

const average =
  reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;

console.log(`Reviews: ${reviews.length} entries, average ${average.toFixed(2)} / 5.`);

if (warnings.length > 0) {
  console.warn(`\n${warnings.length} warning(s):`);
  for (const warning of warnings.slice(0, 40)) console.warn(`  ${warning}`);
  if (warnings.length > 40) console.warn(`  ... and ${warnings.length - 40} more.`);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

console.log('Reviews check passed.');
