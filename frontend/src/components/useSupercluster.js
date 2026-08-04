import { useState, useMemo, useEffect } from 'react';
import Supercluster from 'supercluster';

export function useSupercluster({ points, region, bounds, zoom, options }) {
  const [clusters, setClusters] = useState([]);

  const supercluster = useMemo(() => {
    const sc = new Supercluster(options);
    sc.load(points);
    return sc;
  }, [points, options]);

  useEffect(() => {
    if (bounds && zoom) {
      setClusters(supercluster.getClusters(bounds, zoom));
    }
  }, [bounds, zoom, supercluster]);

  return { clusters, supercluster };
}
