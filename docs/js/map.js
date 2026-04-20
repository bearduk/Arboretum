/* Keele arboretum map — ES5 for older browsers */
(function () {
  var KEELE_FALLBACK = [53.004, -2.267];
  var ZOOM_FALLBACK = 15;

  function getQueryParams() {
    var out = {};
    var q = window.location.search;
    if (!q || q.length < 2) {
      return out;
    }
    var pairs = q.substring(1).split("&");
    for (var i = 0; i < pairs.length; i++) {
      var parts = pairs[i].split("=");
      var k = parts[0] ? decodeURIComponent(parts[0].replace(/\+/g, " ")) : "";
      if (!k) {
        continue;
      }
      var v = parts.length > 1 ? decodeURIComponent(parts.slice(1).join("=").replace(/\+/g, " ")) : "";
      out[k] = v;
    }
    return out;
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) {
      return "";
    }
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function propsToPopupHtml(props) {
    var lines = [];
    if (props.latin_name) {
      lines.push("<strong>" + escapeHtml(props.latin_name) + "</strong>");
    }
    if (props.species) {
      lines.push(escapeHtml(props.species));
    }
    if (props.tag !== undefined && props.tag !== null && props.tag !== "") {
      lines.push("Tag: " + escapeHtml(props.tag));
    }
    if (props.square) {
      lines.push("Square: " + escapeHtml(props.square));
    }
    if (props.planted) {
      lines.push("Planted: " + escapeHtml(props.planted));
    }
    if (props.memorial_commemorative) {
      lines.push("<span class=\"popup-memorial\">" + escapeHtml(props.memorial_commemorative) + "</span>");
    }
    if (props.w3w) {
      lines.push("w3w: " + escapeHtml(props.w3w));
    }
    if (props.comments) {
      lines.push("<span class=\"popup-comments\">" + escapeHtml(props.comments) + "</span>");
    }
    if (props.source_sheet) {
      lines.push("<span class=\"popup-meta\">Layer: " + escapeHtml(props.source_sheet) + "</span>");
    }
    return lines.length ? lines.join("<br/>") : "Tree";
  }

  function makePointToLayer(style) {
    return function (feature, latlng) {
      return L.circleMarker(latlng, style);
    };
  }

  function onEachFeature(popupLayer) {
    return function (feature, layer) {
      if (!feature.properties) {
        return;
      }
      layer.bindPopup(propsToPopupHtml(feature.properties));
      if (popupLayer) {
        popupLayer.push(layer);
      }
    };
  }

  function loadGeoJSON(url, done) {
    var req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.onreadystatechange = function () {
      if (req.readyState !== 4) {
        return;
      }
      if (req.status >= 200 && req.status < 300) {
        try {
          var data = JSON.parse(req.responseText);
          done(null, data);
        } catch (e) {
          done(e);
        }
      } else {
        done(new Error("HTTP " + req.status + " for " + url));
      }
    };
    req.send();
  }

  function buildLayer(geojson, style, layerRef) {
    var popupLayers = [];
    var layer = L.geoJSON(geojson, {
      pointToLayer: makePointToLayer(style),
      onEachFeature: onEachFeature(popupLayers)
    });
    layerRef.list = popupLayers;
    return layer;
  }

  var map = L.map("map").setView(KEELE_FALLBACK, ZOOM_FALLBACK);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var cherriesLayerRef = { list: [] };
  var otherLayerRef = { list: [] };

  var cherriesLayer = null;
  var otherLayer = null;

  var cherriesLabels = null;
  var otherLabels = null;
  var labelsVisible = false;

  function buildLabelsLayer(geojson, className) {
    var labelsGroup = L.layerGroup();
    var features = geojson.features || [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (!f.geometry || f.geometry.type !== "Point") {
        continue;
      }
      var tag = f.properties && f.properties.tag;
      if (tag === undefined || tag === null || tag === "") {
        continue;
      }
      var coords = f.geometry.coordinates;
      var latlng = [coords[1], coords[0]];
      var icon = L.divIcon({
        className: "tree-label " + className,
        html: '<span>' + escapeHtml(tag) + '</span>',
        iconSize: null,
        iconAnchor: [-8, 4]
      });
      var marker = L.marker(latlng, { icon: icon, interactive: false });
      labelsGroup.addLayer(marker);
    }
    return labelsGroup;
  }

  function updateLabelsVisibility() {
    if (labelsVisible) {
      if (cherriesLabels && cherriesLayer && map.hasLayer(cherriesLayer)) {
        map.addLayer(cherriesLabels);
      }
      if (otherLabels && otherLayer && map.hasLayer(otherLayer)) {
        map.addLayer(otherLabels);
      }
    } else {
      if (cherriesLabels) {
        map.removeLayer(cherriesLabels);
      }
      if (otherLabels) {
        map.removeLayer(otherLabels);
      }
    }
  }

  var allFeatures = [];

  function searchTrees(query) {
    if (!query || !query.trim()) {
      return [];
    }
    var q = query.trim().toLowerCase();
    var results = [];
    for (var i = 0; i < allFeatures.length; i++) {
      var item = allFeatures[i];
      var p = item.props;
      var tagMatch = p.tag !== undefined && String(p.tag).toLowerCase() === q;
      var textMatch = false;
      if (!tagMatch) {
        var searchable = [
          p.species || "",
          p.latin_name || "",
          p.tag !== undefined ? String(p.tag) : "",
          p.square || "",
          p.comments || "",
          p.memorial_commemorative || ""
        ].join(" ").toLowerCase();
        textMatch = searchable.indexOf(q) !== -1;
      }
      if (tagMatch || textMatch) {
        results.push({ item: item, tagMatch: tagMatch });
      }
      if (results.length >= 50) {
        break;
      }
    }
    results.sort(function (a, b) {
      if (a.tagMatch && !b.tagMatch) return -1;
      if (!a.tagMatch && b.tagMatch) return 1;
      return 0;
    });
    return results.map(function (r) { return r.item; });
  }

  function showSearchResults(results) {
    var container = document.getElementById("search-results");
    if (!container) return;
    container.innerHTML = "";
    if (results.length === 0) {
      container.innerHTML = '<div class="search-no-results">No matches found</div>';
      container.style.display = "block";
      return;
    }
    for (var i = 0; i < results.length; i++) {
      var item = results[i];
      var p = item.props;
      var div = document.createElement("div");
      div.className = "search-result-item";
      var name = "Unknown";
      if (p.species && p.latin_name) {
        name = p.species + ", " + p.latin_name;
      } else if (p.species) {
        name = p.species;
      } else if (p.latin_name) {
        name = p.latin_name;
      }
      var label = (p.tag ? "[" + p.tag + "] " : "") + name;
      if (p.square) {
        label += " (" + p.square + ")";
      }
      div.textContent = label;
      div.setAttribute("data-index", String(i));
      container.appendChild(div);
    }
    container.style.display = "block";
    container.onclick = function (e) {
      var target = e.target;
      if (target.className.indexOf("search-result-item") === -1) return;
      var idx = parseInt(target.getAttribute("data-index"), 10);
      if (isNaN(idx) || !results[idx]) return;
      var item = results[idx];
      zoomToFeature(item);
      container.style.display = "none";
      document.getElementById("search-input").value = "";
    };
  }

  function zoomToFeature(item) {
    var layerGroup = null;
    var layerRef = null;
    if (item.source === "cherries") {
      layerGroup = cherriesLayer;
      layerRef = cherriesLayerRef;
      ensureLayerVisible("layer-cherries", cherriesLayer);
    } else if (item.source === "other") {
      layerGroup = otherLayer;
      layerRef = otherLayerRef;
      ensureLayerVisible("layer-other", otherLayer);
    }
    if (!layerGroup || !layerRef) return;
    var list = layerRef.list;
    for (var i = 0; i < list.length; i++) {
      var lyr = list[i];
      var f = lyr.feature;
      if (f && f.properties && f.properties.tag === item.props.tag) {
        var ll = lyr.getLatLng ? lyr.getLatLng() : null;
        if (ll) {
          map.setView(ll, Math.max(map.getZoom(), 17));
        }
        lyr.openPopup();
        return;
      }
    }
  }

  function ensureLayerVisible(checkboxId, layer) {
    if (!layer) return;
    var cb = document.getElementById(checkboxId);
    if (cb && !cb.checked) {
      cb.checked = true;
      map.addLayer(layer);
    } else if (!map.hasLayer(layer)) {
      map.addLayer(layer);
    }
    updateLabelsVisibility();
  }

  function initSearch() {
    var input = document.getElementById("search-input");
    var results = document.getElementById("search-results");
    if (!input) return;
    var debounce = null;
    input.oninput = function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        var q = input.value;
        if (!q.trim()) {
          results.style.display = "none";
          results.innerHTML = "";
          return;
        }
        var found = searchTrees(q);
        showSearchResults(found);
      }, 150);
    };
    input.onkeydown = function (e) {
      if (e.keyCode === 27) {
        results.style.display = "none";
        input.value = "";
      }
    };
    document.addEventListener("click", function (e) {
      if (!results.contains(e.target) && e.target !== input) {
        results.style.display = "none";
      }
    });
  }

  var params = getQueryParams();
  var pendingTag = params.tag ? String(params.tag).trim() : "";
  var pendingSquare = params.square ? String(params.square).trim().toLowerCase() : "";

  function setCount(id, n) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = String(n);
    }
  }

  function wireCheckbox(id, layer) {
    var cb = document.getElementById(id);
    if (!cb || !layer) {
      return;
    }
    cb.onchange = function () {
      if (cb.checked) {
        map.addLayer(layer);
      } else {
        map.removeLayer(layer);
      }
    };
  }

  function fitToCherries() {
    if (!cherriesLayer) {
      return;
    }
    var b = cherriesLayer.getBounds();
    if (b && b.isValid()) {
      map.fitBounds(b.pad(0.08));
    }
  }

  function findAndOpenPopup(layerGroup, layerRef, matchFn) {
    if (!layerGroup || !map.hasLayer(layerGroup)) {
      return false;
    }
    var list = layerRef.list;
    for (var i = 0; i < list.length; i++) {
      var lyr = list[i];
      var f = lyr.feature;
      if (f && f.properties && matchFn(f.properties)) {
        var ll = lyr.getLatLng ? lyr.getLatLng() : null;
        if (ll) {
          map.setView(ll, Math.max(map.getZoom(), 17));
        }
        lyr.openPopup();
        return true;
      }
    }
    return false;
  }

  function applyDeepLink() {
    if (!cherriesLayer) {
      return;
    }
    var cbCherries = document.getElementById("layer-cherries");
    if (pendingTag) {
      if (cbCherries) {
        cbCherries.checked = true;
      }
      map.addLayer(cherriesLayer);
      var found = findAndOpenPopup(cherriesLayer, cherriesLayerRef, function (p) {
        return String(p.tag) === pendingTag;
      });
      if (!found && otherLayer) {
        var cbOther = document.getElementById("layer-other");
        if (cbOther) {
          cbOther.checked = true;
        }
        map.addLayer(otherLayer);
        found = findAndOpenPopup(otherLayer, otherLayerRef, function (p) {
          return String(p.tag) === pendingTag;
        });
      }
      return;
    }
    if (pendingSquare) {
      if (cbCherries) {
        cbCherries.checked = true;
      }
      map.addLayer(cherriesLayer);
      findAndOpenPopup(cherriesLayer, cherriesLayerRef, function (p) {
        return p.square && String(p.square).toLowerCase() === pendingSquare;
      });
    }
  }

  var pending = 2;
  function checkDone() {
    pending -= 1;
    if (pending > 0) {
      return;
    }
    fitToCherries();
    applyDeepLink();
  }

  function wireLayerCheckbox(id, layer, labels) {
    var cb = document.getElementById(id);
    if (!cb || !layer) return;
    cb.onchange = function () {
      if (cb.checked) {
        map.addLayer(layer);
      } else {
        map.removeLayer(layer);
      }
      updateLabelsVisibility();
    };
  }

  function wireLabelsToggle() {
    var cb = document.getElementById("toggle-labels");
    if (!cb) return;
    cb.onchange = function () {
      labelsVisible = cb.checked;
      updateLabelsVisibility();
    };
  }

  function registerFeatures(data, source) {
    var features = data.features || [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (f.properties) {
        allFeatures.push({ props: f.properties, source: source });
      }
    }
  }

  loadGeoJSON("data/cherries.geojson", function (err, data) {
    if (err) {
      setCount("count-cherries", "0");
      checkDone();
      return;
    }
    cherriesLayer = buildLayer(
      data,
      { radius: 6, fillColor: "#c41e3a", color: "#7a1020", weight: 1, opacity: 0.9, fillOpacity: 0.85 },
      cherriesLayerRef
    );
    cherriesLabels = buildLabelsLayer(data, "label-cherry");
    registerFeatures(data, "cherries");
    setCount("count-cherries", data.features ? data.features.length : 0);
    map.addLayer(cherriesLayer);
    wireLayerCheckbox("layer-cherries", cherriesLayer, cherriesLabels);
    checkDone();
  });

  loadGeoJSON("data/other_trees.geojson", function (err, data) {
    if (err) {
      setCount("count-other", "0");
      checkDone();
      return;
    }
    otherLayer = buildLayer(
      data,
      { radius: 4, fillColor: "#2d6a4f", color: "#1b4332", weight: 1, opacity: 0.75, fillOpacity: 0.65 },
      otherLayerRef
    );
    otherLabels = buildLabelsLayer(data, "label-other");
    registerFeatures(data, "other");
    setCount("count-other", data.features ? data.features.length : 0);
    wireLayerCheckbox("layer-other", otherLayer, otherLabels);
    checkDone();
  });

  wireLabelsToggle();
  initSearch();
})();
