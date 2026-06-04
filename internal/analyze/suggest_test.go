package analyze

import (
	"strings"
	"testing"
)

func TestSuggest_BelongsToByPrimaryKey(t *testing.T) {
	norm := NormalizeSQL(`select * from "institutions" where "institutions"."id" in (35) and "institutions"."deleted_at" is null`)
	s := Suggest(norm, "Home.php:82")

	if s.Table != "institutions" || s.Column != "id" {
		t.Fatalf("table/col = %q/%q, want institutions/id", s.Table, s.Column)
	}
	if s.Kind != "belongs_to" {
		t.Errorf("kind = %q, want belongs_to", s.Kind)
	}
	if s.Relation != "institution" {
		t.Errorf("relation = %q, want institution (singularized)", s.Relation)
	}
	if !strings.Contains(s.Fix, "with('institution')") {
		t.Errorf("fix should suggest with('institution'), got: %s", s.Fix)
	}
}

func TestSuggest_PolymorphicMorph(t *testing.T) {
	norm := NormalizeSQL(`select * from "unigate_media_assets" where "unigate_media_assets"."mediable_id" in (35) and "unigate_media_assets"."mediable_type" = ? and "type" = ? and "unigate_media_assets"."deleted_at" is null`)
	s := Suggest(norm, "Home.php:82")

	if s.Table != "unigate_media_assets" || s.Column != "mediable_id" {
		t.Fatalf("table/col = %q/%q", s.Table, s.Column)
	}
	if s.Kind != "morph" {
		t.Errorf("kind = %q, want morph", s.Kind)
	}
	if !strings.Contains(strings.ToLower(s.Fix), "polymorph") || !strings.Contains(s.Fix, "with(") {
		t.Errorf("fix should mention polymorphic + with(), got: %s", s.Fix)
	}
}

func TestSuggest_HasManyForeignKey(t *testing.T) {
	norm := NormalizeSQL(`select * from "comments" where "comments"."post_id" in (1, 2, 3)`)
	s := Suggest(norm, "Blog.php:10")

	if s.Table != "comments" || s.Column != "post_id" {
		t.Fatalf("table/col = %q/%q", s.Table, s.Column)
	}
	if s.Kind != "has_many" {
		t.Errorf("kind = %q, want has_many", s.Kind)
	}
	if !strings.Contains(s.Fix, "with(") {
		t.Errorf("fix should suggest eager loading, got: %s", s.Fix)
	}
}
