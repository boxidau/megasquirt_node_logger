#!/usr/bin/env bash

cpp -D CELSIUS $1 | sed 's/entry = /entry[] = /g' > $2
