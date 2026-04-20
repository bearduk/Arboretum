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

  var touchHitRenderer = L.canvas({ tolerance: 10 });

  function makePointToLayer(style) {
    return function (feature, latlng) {
      var markerStyle = { renderer: touchHitRenderer };
      for (var k in style) {
        if (style.hasOwnProperty(k)) {
          markerStyle[k] = style[k];
        }
      }
      return L.circleMarker(latlng, markerStyle);
    };
  }

  function onEachFeature(popupLayer) {
    return function (feature, layer) {
      if (!feature.properties) {
        return;
      }
      layer.on("click", function () {
        setSelectedTreeMarker(layer);
      });
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
  var searchHighlightLayer = null;
  var searchHoverLayer = null;
  var currentSearchResults = [];
  var currentSearchQuery = "";
  var locationWatchId = null;
  var userLocationLayer = null;
  var hasCenteredOnUser = false;
  var selectedTreeMarker = null;
  var selectedTreeOriginalStyle = null;

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

  function getMarkerStyleSnapshot(layer) {
    if (!layer || !layer.options) {
      return null;
    }
    return {
      radius: layer.options.radius,
      fillColor: layer.options.fillColor,
      color: layer.options.color,
      weight: layer.options.weight,
      opacity: layer.options.opacity,
      fillOpacity: layer.options.fillOpacity
    };
  }

  function restoreSelectedTreeMarker() {
    if (!selectedTreeMarker || !selectedTreeOriginalStyle || !selectedTreeMarker.setStyle) {
      return;
    }
    selectedTreeMarker.setStyle({
      fillColor: selectedTreeOriginalStyle.fillColor,
      color: selectedTreeOriginalStyle.color,
      weight: selectedTreeOriginalStyle.weight,
      opacity: selectedTreeOriginalStyle.opacity,
      fillOpacity: selectedTreeOriginalStyle.fillOpacity
    });
    if (selectedTreeOriginalStyle.radius !== undefined && selectedTreeMarker.setRadius) {
      selectedTreeMarker.setRadius(selectedTreeOriginalStyle.radius);
    }
  }

  function setSelectedTreeMarker(layer) {
    if (!layer || !layer.setStyle) {
      return;
    }
    if (selectedTreeMarker === layer) {
      return;
    }
    restoreSelectedTreeMarker();
    selectedTreeMarker = layer;
    selectedTreeOriginalStyle = getMarkerStyleSnapshot(layer);
    layer.setStyle({
      fillColor: "#f59e0b",
      color: "#7c2d12",
      weight: 2,
      opacity: 1,
      fillOpacity: 1
    });
    if (layer.setRadius) {
      layer.setRadius(8);
    }
  }

  function clearSearchHighlights() {
    if (searchHighlightLayer) {
      map.removeLayer(searchHighlightLayer);
      searchHighlightLayer = null;
    }
  }

  function clearSearchHover() {
    if (searchHoverLayer) {
      map.removeLayer(searchHoverLayer);
      searchHoverLayer = null;
    }
  }

  function setLocationStatus(message, kind) {
    var el = document.getElementById("location-status");
    if (!el) return;
    el.className = "location-status";
    if (kind) {
      el.className += " location-status-" + kind;
    }
    el.textContent = message;
  }

  function updateLocationButtons(isTracking) {
    var startBtn = document.getElementById("locate-start");
    var stopBtn = document.getElementById("locate-stop");
    if (startBtn) {
      startBtn.disabled = isTracking;
    }
    if (stopBtn) {
      stopBtn.disabled = !isTracking;
    }
  }

  function updateUserLocation(latlng, accuracyMeters) {
    if (!latlng) return;
    if (!userLocationLayer) {
      userLocationLayer = L.layerGroup();
      map.addLayer(userLocationLayer);
    }
    userLocationLayer.clearLayers();

    var accuracy = typeof accuracyMeters === "number" && accuracyMeters > 0 ? accuracyMeters : 0;
    if (accuracy > 0) {
      var accuracyCircle = L.circle(latlng, {
        radius: accuracy,
        color: "#2563eb",
        weight: 1,
        opacity: 0.55,
        fillColor: "#60a5fa",
        fillOpacity: 0.18
      });
      userLocationLayer.addLayer(accuracyCircle);
    }

    var userMarker = L.circleMarker(latlng, {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: "#2563eb",
      fillOpacity: 1,
      className: "user-location-marker"
    });
    userLocationLayer.addLayer(userMarker);

    if (!hasCenteredOnUser) {
      hasCenteredOnUser = true;
      map.setView(latlng, Math.max(map.getZoom(), 17));
    }
  }

  function stopLocationTracking(clearVisual) {
    if (locationWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchId);
      locationWatchId = null;
    }
    updateLocationButtons(false);
    if (clearVisual && userLocationLayer) {
      map.removeLayer(userLocationLayer);
      userLocationLayer = null;
      hasCenteredOnUser = false;
    }
    if (clearVisual) {
      setLocationStatus("Location tracking is off.", "muted");
    } else {
      setLocationStatus("Location tracking stopped.", "muted");
    }
  }

  function startLocationTracking() {
    if (!navigator.geolocation) {
      setLocationStatus("Location not supported by this browser.", "error");
      updateLocationButtons(false);
      return;
    }
    if (locationWatchId !== null) {
      return;
    }

    hasCenteredOnUser = false;
    setLocationStatus("Requesting location permission...", "info");
    updateLocationButtons(true);

    locationWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        var latlng = [pos.coords.latitude, pos.coords.longitude];
        updateUserLocation(latlng, pos.coords.accuracy);
        setLocationStatus("Tracking your location live.", "info");
      },
      function (err) {
        var msg = "Unable to get your location.";
        if (err && err.code === 1) {
          msg = "Location permission denied. Please allow access and try again.";
        } else if (err && err.code === 2) {
          msg = "Location unavailable. Try moving to a clearer area.";
        } else if (err && err.code === 3) {
          msg = "Location request timed out. Please try again.";
        }
        setLocationStatus(msg, "error");
        stopLocationTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }
    );
  }

  function wireLocationControls() {
    var startBtn = document.getElementById("locate-start");
    var stopBtn = document.getElementById("locate-stop");
    if (!startBtn || !stopBtn) {
      return;
    }
    startBtn.onclick = function () {
      startLocationTracking();
    };
    stopBtn.onclick = function () {
      stopLocationTracking(false);
    };
    updateLocationButtons(false);
    setLocationStatus("Location tracking is off.", "muted");
  }

  function isSourceVisible(source) {
    if (source === "cherries") {
      return !!(cherriesLayer && map.hasLayer(cherriesLayer));
    }
    if (source === "other") {
      return !!(otherLayer && map.hasLayer(otherLayer));
    }
    return false;
  }

  function renderSearchHighlights(results, fitToResults) {
    clearSearchHighlights();
    var highlightable = [];
    for (var i = 0; i < results.length; i++) {
      var item = results[i];
      if (!item || !item.latlng || !isSourceVisible(item.source)) {
        continue;
      }
      highlightable.push(item);
    }
    if (!highlightable.length) {
      return { visibleCount: 0, totalCount: results.length };
    }

    searchHighlightLayer = L.layerGroup();
    var bounds = L.latLngBounds();
    for (var j = 0; j < highlightable.length; j++) {
      var match = highlightable[j];
      var marker = L.circleMarker(match.latlng, {
        className: "search-highlight-marker",
        radius: 9,
        fillColor: "#1d4ed8",
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      });
      searchHighlightLayer.addLayer(marker);
      bounds.extend(match.latlng);
    }
    map.addLayer(searchHighlightLayer);

    if (fitToResults && highlightable.length > 1 && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12));
    }
    return { visibleCount: highlightable.length, totalCount: results.length };
  }

  function refreshSearchHighlights() {
    if (!currentSearchQuery) {
      clearSearchHighlights();
      clearSearchHover();
      return;
    }
    renderSearchHighlights(currentSearchResults, false);
  }

  function highlightHoveredResult(item) {
    clearSearchHover();
    if (!item || !item.latlng || !isSourceVisible(item.source)) {
      return;
    }
    var marker = L.circleMarker(item.latlng, {
      radius: 11,
      fillColor: "#f59e0b",
      color: "#ffffff",
      weight: 3,
      opacity: 1,
      fillOpacity: 0.95,
      className: "search-hover-marker"
    });
    searchHoverLayer = L.layerGroup([marker]);
    map.addLayer(searchHoverLayer);
  }

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

  function showSearchResults(results, fitToResults) {
    var container = document.getElementById("search-results");
    if (!container) return;
    container.innerHTML = "";
    currentSearchResults = results.slice(0);
    if (results.length === 0) {
      container.innerHTML = '<div class="search-no-results">No matches found</div>';
      container.style.display = "block";
      clearSearchHighlights();
      clearSearchHover();
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
    var highlightInfo = renderSearchHighlights(results, fitToResults);
    var status = document.createElement("div");
    status.className = "search-results-status";
    if (highlightInfo.visibleCount === highlightInfo.totalCount) {
      status.textContent = highlightInfo.visibleCount + " matches highlighted on map";
    } else {
      status.textContent =
        highlightInfo.visibleCount +
        " of " +
        highlightInfo.totalCount +
        " matches highlighted (visible layers only)";
    }
    container.insertBefore(status, container.firstChild);
    container.onclick = function (e) {
      var target = e.target;
      if (target.className.indexOf("search-result-item") === -1) return;
      var idx = parseInt(target.getAttribute("data-index"), 10);
      if (isNaN(idx) || !results[idx]) return;
      var item = results[idx];
      zoomToFeature(item);
      container.style.display = "none";
      document.getElementById("search-input").value = "";
      currentSearchQuery = "";
      currentSearchResults = [];
      clearSearchHighlights();
      clearSearchHover();
    };
    container.onmouseover = function (e) {
      var target = e.target;
      if (target.className.indexOf("search-result-item") === -1) return;
      var idx = parseInt(target.getAttribute("data-index"), 10);
      if (isNaN(idx) || !results[idx]) return;
      highlightHoveredResult(results[idx]);
    };
    container.onmouseout = function (e) {
      var target = e.target;
      if (target.className.indexOf("search-result-item") === -1) return;
      var rel = e.relatedTarget;
      if (rel && rel.className && String(rel.className).indexOf("search-result-item") !== -1) {
        return;
      }
      clearSearchHover();
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
        setSelectedTreeMarker(lyr);
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
        var trimmed = q.trim();
        if (!trimmed) {
          results.style.display = "none";
          results.innerHTML = "";
          currentSearchQuery = "";
          currentSearchResults = [];
          clearSearchHighlights();
          clearSearchHover();
          return;
        }
        var fitToResults = currentSearchQuery !== trimmed.toLowerCase();
        currentSearchQuery = trimmed.toLowerCase();
        var found = searchTrees(q);
        showSearchResults(found, fitToResults);
      }, 150);
    };
    input.onkeydown = function (e) {
      if (e.keyCode === 27) {
        results.style.display = "none";
        input.value = "";
        currentSearchQuery = "";
        currentSearchResults = [];
        clearSearchHighlights();
        clearSearchHover();
      }
    };
    document.addEventListener("click", function (e) {
      if (!results.contains(e.target) && e.target !== input) {
        results.style.display = "none";
        currentSearchQuery = "";
        currentSearchResults = [];
        clearSearchHighlights();
        clearSearchHover();
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
        setSelectedTreeMarker(lyr);
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
      refreshSearchHighlights();
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
        var latlng = null;
        if (f.geometry && f.geometry.type === "Point" && f.geometry.coordinates && f.geometry.coordinates.length >= 2) {
          latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
        }
        allFeatures.push({ props: f.properties, source: source, latlng: latlng });
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
  wireLocationControls();
})();
