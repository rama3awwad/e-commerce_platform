#!/bin/sh
mods="users auth products orders notifications inventory"
fail=0
for m in $mods; do
  for o in $mods; do
    [ "$m" = "$o" ] && continue
    hits=$(grep -rnE "from '(.\./)+$o/" "src/$m" --include=*.ts | grep -vE "/$o/api/|/common/internal-http/|/$o/$o[.]module'") || true
    if [ -n "$hits" ]; then echo "$hits"; fail=1; fi
  done
done
# Consumers may import contracts and the shared internal HTTP kernel only; never import a provider module.
for m in $mods; do
  hits=$(grep -rnE "from '(\.\./)+($mods)/[^' ]*[.]module'" "src/$m" --include=*.ts | grep -vE "/$m/$m[.]module'") || true
  if [ -n "$hits" ]; then echo "$hits"; fail=1; fi
done
exit $fail
