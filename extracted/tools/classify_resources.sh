#!/usr/bin/env bash
set -euo pipefail

root="${1:-extracted}"
ios_app="$root/ios_raw/Payload/GameKindred.app"
android_raw="$root/android_raw"
out="$root/resources_by_type"

mkdir -p \
  "$out/ios/data_audio/mp3" \
  "$out/ios/data_audio/ogg" \
  "$out/ios/data_audio/wav" \
  "$out/ios/app_images" \
  "$out/ios/app_audio" \
  "$out/android/images" \
  "$out/android/native_libs"

link_as() {
  local src="$1"
  local dst="$2"
  mkdir -p "$(dirname "$dst")"
  [[ -e "$dst" ]] || ln "$src" "$dst"
}

link_existing_dir() {
  local src="$1"
  local dst="$2"
  [[ -e "$dst" ]] || ln "$src" "$dst"
}

if [[ -d "$ios_app/Data" ]]; then
  report="$root/reports/ios_data_file_types_by_path.txt"
  if [[ -f "$report" ]]; then
    IOS_APP="$ios_app" OUT_DIR="$out" perl -MFile::Basename=basename -ne '
      next unless /^(Data\/[^:]+):\s*(.*)$/;
      my ($rel, $desc) = ($1, $2);
      my $ext = $desc =~ /Ogg data/ ? "ogg"
        : $desc =~ /WAVE audio/ ? "wav"
        : $desc =~ /(MPEG ADTS|Audio file with ID3)/ ? "mp3"
        : "";
      next unless $ext;
      my $src = "$ENV{IOS_APP}/$rel";
      next unless -f $src;
      my $base = basename($src);
      my $dst = "$ENV{OUT_DIR}/ios/data_audio/$ext/$base.$ext";
      link($src, $dst) unless -e $dst;
    ' "$report"
  else
    while IFS= read -r -d '' file; do
      mime="$(file -b --mime-type "$file")"
      base="$(basename "$file")"
      case "$mime" in
        audio/mpeg)
          link_existing_dir "$file" "$out/ios/data_audio/mp3/$base.mp3"
          ;;
        audio/ogg|application/ogg)
          link_existing_dir "$file" "$out/ios/data_audio/ogg/$base.ogg"
          ;;
        audio/x-wav|audio/wav)
          link_existing_dir "$file" "$out/ios/data_audio/wav/$base.wav"
          ;;
      esac
    done < <(find "$ios_app/Data" -type f -print0)
  fi
fi

if [[ -d "$ios_app" ]]; then
  while IFS= read -r -d '' file; do
    rel="${file#$ios_app/}"
    safe="${rel//\//__}"
    link_as "$file" "$out/ios/app_images/$safe"
  done < <(find "$ios_app" -type f -name '*.png' -print0)

  while IFS= read -r -d '' file; do
    rel="${file#$ios_app/}"
    safe="${rel//\//__}"
    link_as "$file" "$out/ios/app_audio/$safe"
  done < <(find "$ios_app" -type f \( -name '*.wav' -o -name '*.caf' \) -print0)
fi

if [[ -d "$android_raw" ]]; then
  while IFS= read -r -d '' file; do
    rel="${file#$android_raw/}"
    safe="${rel//\//__}"
    link_as "$file" "$out/android/images/$safe"
  done < <(find "$android_raw" -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.webp' \) -print0)

  while IFS= read -r -d '' file; do
    rel="${file#$android_raw/}"
    safe="${rel//\//__}"
    link_as "$file" "$out/android/native_libs/$safe"
  done < <(find "$android_raw/lib" -type f -name '*.so' -print0 2>/dev/null || true)
fi

printf 'classified resources under %s\n' "$out"
