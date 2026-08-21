CREATE TABLE IF NOT EXISTS "Ball" (
    "id" TEXT NOT NULL,
    "overId" TEXT NOT NULL,
    "ballNumber" INTEGER NOT NULL,
    "batterId" TEXT NOT NULL,
    "nonStrikerId" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "extras" INTEGER NOT NULL DEFAULT 0,
    "extraType" TEXT,
    "isWicket" BOOLEAN NOT NULL DEFAULT false,
    "wicketType" TEXT,
    "wicketAssists" TEXT,
    "directHit" BOOLEAN,
    "droppedBy" TEXT,
    "dropDifficulty" TEXT,
    "dismissedPlayerId" TEXT,
    "clientEventId" TEXT,
    "bowlerId" TEXT,

    CONSTRAINT "Ball_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Over" (
    "id" TEXT NOT NULL,
    "inningId" TEXT NOT NULL,
    "overNumber" INTEGER NOT NULL,
    "bowlerId" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "extras" INTEGER NOT NULL DEFAULT 0,
    "wickets" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Over_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Booking" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "slot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "isViceCaptain" BOOLEAN NOT NULL DEFAULT false,
    "isWk" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Ground" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "localName" TEXT,
    "description" TEXT,
    "category" TEXT,
    "groundType" TEXT NOT NULL DEFAULT 'outdoor',
    "playingSurface" TEXT,
    "ballTypes" JSONB,
    "address" TEXT,
    "street" TEXT,
    "area" TEXT,
    "city" TEXT,
    "district" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "googlePlaceId" TEXT,
    "googleMapsUrl" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "website" TEXT,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "permanentlyClosed" BOOLEAN NOT NULL DEFAULT false,
    "temporarilyClosed" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "submittedById" TEXT,
    "rejectionReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "location" TEXT,
    "price" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "facilities" JSONB,

    CONSTRAINT "Ground_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GroundImage" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageType" TEXT NOT NULL DEFAULT 'cover',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroundImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GroundOpeningHours" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GroundOpeningHours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GroundAmenity" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "amenity" TEXT NOT NULL,

    CONSTRAINT "GroundAmenity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GroundFavourite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,

    CONSTRAINT "GroundFavourite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GroundReview" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "review" TEXT,
    "images" JSONB,
    "verifiedBooking" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GroundReview_pkey" PRIMARY KEY ("id")
);