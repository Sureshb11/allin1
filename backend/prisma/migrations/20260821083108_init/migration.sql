-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "proUntil" TIMESTAMP(3),
    "city" TEXT,
    "country" TEXT,
    "district" TEXT,
    "pincode" TEXT,
    "state" TEXT,
    "coverUrl" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "userId" TEXT NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT,
    "skill" TEXT,

    CONSTRAINT "UserSport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "website" TEXT,
    "city" TEXT,
    "logoUrl" TEXT,
    "achievements" TEXT,
    "bio" TEXT,
    "colors" TEXT,
    "country" TEXT,
    "foundedYear" INTEGER,
    "homeGround" TEXT,
    "state" TEXT,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "ownerId" TEXT,
    "coverUrl" TEXT,
    "awards" JSONB,
    "chatRoomId" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamJoinRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,

    CONSTRAINT "TeamJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamFollow" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "TeamFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "teamId" TEXT,
    "stats" JSONB,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "userId" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "jerseyNumber" INTEGER,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "isViceCaptain" BOOLEAN NOT NULL DEFAULT false,
    "battingStyle" TEXT,
    "bowlingStyle" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalStatSubmission" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "data" JSONB NOT NULL,
    "imageUrls" TEXT[],

    CONSTRAINT "HistoricalStatSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "team1Id" TEXT NOT NULL,
    "team2Id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score1" TEXT,
    "score2" TEXT,
    "venue" TEXT,
    "matchType" TEXT,
    "startTime" TIMESTAMP(3),
    "currentInnings" INTEGER NOT NULL DEFAULT 1,
    "overs" INTEGER,
    "tossDecision" TEXT,
    "tossWinnerId" TEXT,
    "result" TEXT,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "ballType" TEXT,
    "scorerId" TEXT,
    "createdBy" TEXT,
    "ballIntelligenceEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT,
    "eventType" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,
    "period" TEXT,
    "periodNum" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "SportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "isViceCaptain" BOOLEAN NOT NULL DEFAULT false,
    "isWk" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inning" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "targetScore" INTEGER,
    "inningNumber" INTEGER NOT NULL,
    "battingTeamId" TEXT NOT NULL,
    "bowlingTeamId" TEXT NOT NULL,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "totalWickets" INTEGER NOT NULL DEFAULT 0,
    "extras" JSONB,
    "totalOvers" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBowlerId" TEXT,
    "nonStrikerId" TEXT,
    "strikerId" TEXT,

    CONSTRAINT "Inning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Over" (
    "id" TEXT NOT NULL,
    "inningId" TEXT NOT NULL,
    "overNumber" INTEGER NOT NULL,
    "bowlerId" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "extras" INTEGER NOT NULL DEFAULT 0,
    "wickets" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Over_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ball" (
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

-- CreateTable
CREATE TABLE "BallIntelligence" (
    "id" TEXT NOT NULL,
    "ballId" TEXT NOT NULL,
    "shotAngle" DOUBLE PRECISION NOT NULL,
    "shotZone" TEXT NOT NULL,
    "shotDistance" INTEGER,
    "shotType" TEXT,
    "shotOutcome" TEXT,
    "connectionType" TEXT,
    "lofted" BOOLEAN,
    "selectedShotRank" INTEGER,
    "rankingEngineVersion" INTEGER,
    "aiCommentary" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SCORER',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BallIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStatSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "licenceNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStatSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPlayerStat" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalPlayerId" TEXT,
    "playerId" TEXT,
    "playerName" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "format" TEXT,
    "matches" INTEGER,
    "innings" INTEGER,
    "runs" INTEGER,
    "balls" INTEGER,
    "average" DOUBLE PRECISION,
    "strikeRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPlayerStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPlayerShotStat" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalPlayerId" TEXT,
    "playerId" TEXT,
    "level" TEXT NOT NULL,
    "shotType" TEXT,
    "shotZone" TEXT,
    "balls" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL,
    "strikeRate" DOUBLE PRECISION,
    "dismissals" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPlayerShotStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "News" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT,
    "category" TEXT,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT,
    "sellerId" TEXT NOT NULL,
    "images" JSONB,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pincode" (
    "id" SERIAL NOT NULL,
    "office" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "Pincode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryPhoto" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "userId" TEXT,
    "teamId" TEXT,
    "matchId" TEXT,

    CONSTRAINT "GalleryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "format" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "venue" TEXT,
    "city" TEXT,
    "maxTeams" INTEGER,
    "prizePool" TEXT,
    "description" TEXT,
    "organizer" TEXT,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "ballType" TEXT,
    "overs" INTEGER,
    "championId" TEXT,
    "organizerId" TEXT,
    "logoUrl" TEXT,
    "banner" TEXT,
    "contact" JSONB,
    "location" JSONB,
    "regWindow" JSONB,
    "registration" JSONB,
    "rules" JSONB,
    "pointsRules" JSONB,
    "prizes" JSONB,
    "flags" JSONB,
    "media" JSONB,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stream" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "matchId" TEXT,
    "channel" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "quality" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ground" (
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

-- CreateTable
CREATE TABLE "GroundImage" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageType" TEXT NOT NULL DEFAULT 'cover',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroundImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroundOpeningHours" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GroundOpeningHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroundAmenity" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "amenity" TEXT NOT NULL,

    CONSTRAINT "GroundAmenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroundReview" (
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

-- CreateTable
CREATE TABLE "GroundFavourite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,

    CONSTRAINT "GroundFavourite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroundAvailability" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',

    CONSTRAINT "GroundAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "slot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'Medium',
    "duration" INTEGER NOT NULL DEFAULT 300,
    "questions" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizResult" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "president" TEXT,
    "secretary" TEXT,
    "foundedYear" INTEGER,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "membershipFee" TEXT,
    "facilities" JSONB,
    "bio" TEXT,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'team',

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMember" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatRoomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "matchId" TEXT,
    "uploadUrl" TEXT,
    "thumbnailUrl" TEXT,
    "duration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAnalysis" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "videoId" TEXT NOT NULL,
    "highlights" INTEGER NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "insights" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,

    CONSTRAINT "VideoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookingFor" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "format" TEXT,
    "ageGroup" TEXT,
    "contactInfo" TEXT,
    "postedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "sport" TEXT NOT NULL DEFAULT 'cricket',

    CONSTRAINT "LookingFor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookingForConnection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listingId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "posterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "chatRoomId" TEXT,

    CONSTRAINT "LookingForConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coach" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "speciality" TEXT,
    "experience" INTEGER,
    "location" TEXT,
    "bio" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pricePerHour" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Coach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachBooking" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coachId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "CoachBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Umpire" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "level" TEXT,
    "experience" INTEGER,
    "location" TEXT,
    "bio" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "contactInfo" TEXT,
    "matchesUmpired" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Umpire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scorer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "experience" INTEGER,
    "location" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "contactInfo" TEXT,

    CONSTRAINT "Scorer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScorerBooking" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scorerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "ScorerBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTeam" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "tied" INTEGER NOT NULL DEFAULT 0,
    "nrr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "group" TEXT NOT NULL DEFAULT 'A',
    "stats" JSONB,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "requestedById" TEXT,
    "chatRoomId" TEXT,
    "requestNote" TEXT,

    CONSTRAINT "TournamentTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT,
    "team1Id" TEXT,
    "team2Id" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "venue" TEXT,
    "round" TEXT,
    "result" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "leg" INTEGER,
    "phaseId" TEXT,
    "resultKind" TEXT,
    "resultStats" JSONB,
    "seriesId" TEXT,
    "winnerTeamId" TEXT,
    "placeholder1" TEXT,
    "placeholder2" TEXT,

    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchMVP" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerName" TEXT,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bowl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "field" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "votes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MatchMVP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchAward" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerName" TEXT,
    "teamId" TEXT,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "MatchAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentAward" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tournamentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerName" TEXT,
    "teamName" TEXT,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detail" TEXT,

    CONSTRAINT "TournamentAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "team" TEXT,
    "text" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "authorAvatar" TEXT,
    "mediaUrl" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RummyGame" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 250,
    "openDrop" INTEGER NOT NULL DEFAULT 25,
    "middleDrop" INTEGER NOT NULL DEFAULT 50,
    "fullCount" INTEGER NOT NULL DEFAULT 80,
    "adjustReentry" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "RummyGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RummyPlayer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RummyPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RummyRosterPlayer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "RummyRosterPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RummyRound" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gameId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,

    CONSTRAINT "RummyRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RummyScore" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "RummyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportConfiguration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "accent" TEXT,
    "rules" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPhase" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB,

    CONSTRAINT "TournamentPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSubstitution" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerOutId" TEXT NOT NULL,
    "playerInId" TEXT NOT NULL,
    "period" TEXT,

    CONSTRAINT "MatchSubstitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityFeed" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "actorId" TEXT,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "payload" JSONB NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ActivityFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Like" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "grantedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRole" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastSession" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "broadcasterUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pairingCode" TEXT,
    "pairingTokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "pairAttempts" INTEGER NOT NULL DEFAULT 0,
    "overlayTokenHash" TEXT,
    "youtubeBroadcastId" TEXT,
    "youtubeStreamId" TEXT,
    "youtubeVideoId" TEXT,
    "requestedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastAuditLog" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "broadcastSessionId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE INDEX "UserSport_sport_idx" ON "UserSport"("sport");

-- CreateIndex
CREATE UNIQUE INDEX "UserSport_userId_sport_key" ON "UserSport"("userId", "sport");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Team_sport_idx" ON "Team"("sport");

-- CreateIndex
CREATE INDEX "Team_ownerId_idx" ON "Team"("ownerId");

-- CreateIndex
CREATE INDEX "TeamJoinRequest_teamId_status_idx" ON "TeamJoinRequest"("teamId", "status");

-- CreateIndex
CREATE INDEX "TeamJoinRequest_userId_idx" ON "TeamJoinRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamJoinRequest_teamId_userId_key" ON "TeamJoinRequest"("teamId", "userId");

-- CreateIndex
CREATE INDEX "TeamFollow_userId_idx" ON "TeamFollow"("userId");

-- CreateIndex
CREATE INDEX "TeamFollow_teamId_idx" ON "TeamFollow"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamFollow_userId_teamId_key" ON "TeamFollow"("userId", "teamId");

-- CreateIndex
CREATE INDEX "Player_sport_idx" ON "Player"("sport");

-- CreateIndex
CREATE INDEX "Player_userId_idx" ON "Player"("userId");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "HistoricalStatSubmission_playerId_idx" ON "HistoricalStatSubmission"("playerId");

-- CreateIndex
CREATE INDEX "HistoricalStatSubmission_status_idx" ON "HistoricalStatSubmission"("status");

-- CreateIndex
CREATE INDEX "Match_sport_status_idx" ON "Match"("sport", "status");

-- CreateIndex
CREATE INDEX "Match_startTime_idx" ON "Match"("startTime");

-- CreateIndex
CREATE INDEX "Match_createdBy_idx" ON "Match"("createdBy");

-- CreateIndex
CREATE INDEX "SportEvent_matchId_idx" ON "SportEvent"("matchId");

-- CreateIndex
CREATE INDEX "SportEvent_sport_idx" ON "SportEvent"("sport");

-- CreateIndex
CREATE INDEX "MatchPlayer_playerId_idx" ON "MatchPlayer"("playerId");

-- CreateIndex
CREATE INDEX "MatchPlayer_teamId_idx" ON "MatchPlayer"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_playerId_key" ON "MatchPlayer"("matchId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Inning_matchId_inningNumber_key" ON "Inning"("matchId", "inningNumber");

-- CreateIndex
CREATE INDEX "Over_bowlerId_idx" ON "Over"("bowlerId");

-- CreateIndex
CREATE UNIQUE INDEX "Over_inningId_overNumber_key" ON "Over"("inningId", "overNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Ball_clientEventId_key" ON "Ball"("clientEventId");

-- CreateIndex
CREATE INDEX "Ball_overId_idx" ON "Ball"("overId");

-- CreateIndex
CREATE INDEX "Ball_batterId_idx" ON "Ball"("batterId");

-- CreateIndex
CREATE INDEX "Ball_bowlerId_idx" ON "Ball"("bowlerId");

-- CreateIndex
CREATE INDEX "Ball_dismissedPlayerId_idx" ON "Ball"("dismissedPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "BallIntelligence_ballId_key" ON "BallIntelligence"("ballId");

-- CreateIndex
CREATE INDEX "BallIntelligence_shotZone_idx" ON "BallIntelligence"("shotZone");

-- CreateIndex
CREATE INDEX "BallIntelligence_shotType_idx" ON "BallIntelligence"("shotType");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStatSource_key_key" ON "PlayerStatSource"("key");

-- CreateIndex
CREATE INDEX "ExternalPlayerStat_playerId_idx" ON "ExternalPlayerStat"("playerId");

-- CreateIndex
CREATE INDEX "ExternalPlayerStat_level_idx" ON "ExternalPlayerStat"("level");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPlayerStat_sourceId_externalPlayerId_level_format_key" ON "ExternalPlayerStat"("sourceId", "externalPlayerId", "level", "format");

-- CreateIndex
CREATE INDEX "ExternalPlayerShotStat_playerId_idx" ON "ExternalPlayerShotStat"("playerId");

-- CreateIndex
CREATE INDEX "ExternalPlayerShotStat_shotType_idx" ON "ExternalPlayerShotStat"("shotType");

-- CreateIndex
CREATE INDEX "ExternalPlayerShotStat_shotZone_idx" ON "ExternalPlayerShotStat"("shotZone");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPlayerShotStat_sourceId_externalPlayerId_level_shot_key" ON "ExternalPlayerShotStat"("sourceId", "externalPlayerId", "level", "shotType", "shotZone");

-- CreateIndex
CREATE INDEX "News_sport_idx" ON "News"("sport");

-- CreateIndex
CREATE INDEX "Product_sport_idx" ON "Product"("sport");

-- CreateIndex
CREATE INDEX "Pincode_office_idx" ON "Pincode"("office");

-- CreateIndex
CREATE INDEX "Pincode_pincode_idx" ON "Pincode"("pincode");

-- CreateIndex
CREATE INDEX "pincode_pin_prefix_idx" ON "Pincode"("pincode");

-- CreateIndex
CREATE INDEX "GalleryPhoto_userId_createdAt_idx" ON "GalleryPhoto"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryPhoto_teamId_createdAt_idx" ON "GalleryPhoto"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryPhoto_matchId_idx" ON "GalleryPhoto"("matchId");

-- CreateIndex
CREATE INDEX "Tournament_sport_idx" ON "Tournament"("sport");

-- CreateIndex
CREATE INDEX "Stream_sport_idx" ON "Stream"("sport");

-- CreateIndex
CREATE UNIQUE INDEX "Ground_googlePlaceId_key" ON "Ground"("googlePlaceId");

-- CreateIndex
CREATE INDEX "Ground_sport_idx" ON "Ground"("sport");

-- CreateIndex
CREATE INDEX "Ground_city_idx" ON "Ground"("city");

-- CreateIndex
CREATE INDEX "Ground_state_idx" ON "Ground"("state");

-- CreateIndex
CREATE INDEX "Ground_status_idx" ON "Ground"("status");

-- CreateIndex
CREATE INDEX "Ground_groundType_idx" ON "Ground"("groundType");

-- CreateIndex
CREATE INDEX "Ground_verified_idx" ON "Ground"("verified");

-- CreateIndex
CREATE INDEX "Ground_latitude_longitude_idx" ON "Ground"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Ground_submittedById_idx" ON "Ground"("submittedById");

-- CreateIndex
CREATE INDEX "GroundImage_groundId_idx" ON "GroundImage"("groundId");

-- CreateIndex
CREATE INDEX "GroundOpeningHours_groundId_idx" ON "GroundOpeningHours"("groundId");

-- CreateIndex
CREATE INDEX "GroundAmenity_groundId_idx" ON "GroundAmenity"("groundId");

-- CreateIndex
CREATE INDEX "GroundReview_groundId_idx" ON "GroundReview"("groundId");

-- CreateIndex
CREATE INDEX "GroundReview_userId_idx" ON "GroundReview"("userId");

-- CreateIndex
CREATE INDEX "GroundFavourite_userId_idx" ON "GroundFavourite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroundFavourite_userId_groundId_key" ON "GroundFavourite"("userId", "groundId");

-- CreateIndex
CREATE INDEX "GroundAvailability_groundId_date_idx" ON "GroundAvailability"("groundId", "date");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "Booking_groundId_idx" ON "Booking"("groundId");

-- CreateIndex
CREATE INDEX "Quiz_sport_idx" ON "Quiz"("sport");

-- CreateIndex
CREATE INDEX "Club_sport_idx" ON "Club"("sport");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMember_chatRoomId_userId_key" ON "ChatMember"("chatRoomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAnalysis_videoId_key" ON "VideoAnalysis"("videoId");

-- CreateIndex
CREATE INDEX "LookingFor_sport_status_idx" ON "LookingFor"("sport", "status");

-- CreateIndex
CREATE INDEX "LookingFor_type_idx" ON "LookingFor"("type");

-- CreateIndex
CREATE INDEX "LookingForConnection_posterId_status_idx" ON "LookingForConnection"("posterId", "status");

-- CreateIndex
CREATE INDEX "LookingForConnection_requesterId_idx" ON "LookingForConnection"("requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "LookingForConnection_listingId_requesterId_key" ON "LookingForConnection"("listingId", "requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTeam_tournamentId_teamId_key" ON "TournamentTeam"("tournamentId", "teamId");

-- CreateIndex
CREATE INDEX "MatchMVP_playerId_idx" ON "MatchMVP"("playerId");

-- CreateIndex
CREATE INDEX "MatchMVP_matchId_idx" ON "MatchMVP"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchMVP_matchId_playerId_key" ON "MatchMVP"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "MatchAward_playerId_kind_idx" ON "MatchAward"("playerId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MatchAward_matchId_kind_key" ON "MatchAward"("matchId", "kind");

-- CreateIndex
CREATE INDEX "TournamentAward_playerId_idx" ON "TournamentAward"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentAward_tournamentId_kind_key" ON "TournamentAward"("tournamentId", "kind");

-- CreateIndex
CREATE INDEX "Post_sport_createdAt_idx" ON "Post"("sport", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_postId_createdAt_idx" ON "Comment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "RummyGame_userId_createdAt_idx" ON "RummyGame"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RummyGame_status_idx" ON "RummyGame"("status");

-- CreateIndex
CREATE INDEX "RummyPlayer_gameId_idx" ON "RummyPlayer"("gameId");

-- CreateIndex
CREATE INDEX "RummyRosterPlayer_userId_idx" ON "RummyRosterPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RummyRosterPlayer_userId_name_key" ON "RummyRosterPlayer"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RummyRound_gameId_roundNumber_key" ON "RummyRound"("gameId", "roundNumber");

-- CreateIndex
CREATE INDEX "RummyScore_roundId_idx" ON "RummyScore"("roundId");

-- CreateIndex
CREATE INDEX "RummyScore_playerId_idx" ON "RummyScore"("playerId");

-- CreateIndex
CREATE INDEX "TournamentPhase_tournamentId_idx" ON "TournamentPhase"("tournamentId");

-- CreateIndex
CREATE INDEX "MatchSubstitution_matchId_teamId_idx" ON "MatchSubstitution"("matchId", "teamId");

-- CreateIndex
CREATE INDEX "ActivityFeed_sport_createdAt_idx" ON "ActivityFeed"("sport", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityFeed_subjectType_subjectId_createdAt_idx" ON "ActivityFeed"("subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "Like_targetType_targetId_idx" ON "Like"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_targetType_targetId_key" ON "Like"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "UserRole_userId_status_idx" ON "UserRole"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE INDEX "MatchRole_userId_status_idx" ON "MatchRole"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRole_matchId_userId_role_key" ON "MatchRole"("matchId", "userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastSession_pairingTokenHash_key" ON "BroadcastSession"("pairingTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastSession_overlayTokenHash_key" ON "BroadcastSession"("overlayTokenHash");

-- CreateIndex
CREATE INDEX "BroadcastSession_matchId_status_idx" ON "BroadcastSession"("matchId", "status");

-- CreateIndex
CREATE INDEX "BroadcastSession_status_tokenExpiresAt_idx" ON "BroadcastSession"("status", "tokenExpiresAt");

-- CreateIndex
CREATE INDEX "BroadcastAuditLog_matchId_createdAt_idx" ON "BroadcastAuditLog"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastAuditLog_broadcastSessionId_createdAt_idx" ON "BroadcastAuditLog"("broadcastSessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSport" ADD CONSTRAINT "UserSport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFollow" ADD CONSTRAINT "TeamFollow_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFollow" ADD CONSTRAINT "TeamFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalStatSubmission" ADD CONSTRAINT "HistoricalStatSubmission_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_team1Id_fkey" FOREIGN KEY ("team1Id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_team2Id_fkey" FOREIGN KEY ("team2Id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportEvent" ADD CONSTRAINT "SportEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inning" ADD CONSTRAINT "Inning_battingTeamId_fkey" FOREIGN KEY ("battingTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inning" ADD CONSTRAINT "Inning_bowlingTeamId_fkey" FOREIGN KEY ("bowlingTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inning" ADD CONSTRAINT "Inning_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Over" ADD CONSTRAINT "Over_bowlerId_fkey" FOREIGN KEY ("bowlerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Over" ADD CONSTRAINT "Over_inningId_fkey" FOREIGN KEY ("inningId") REFERENCES "Inning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ball" ADD CONSTRAINT "Ball_batterId_fkey" FOREIGN KEY ("batterId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ball" ADD CONSTRAINT "Ball_bowlerId_fkey" FOREIGN KEY ("bowlerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ball" ADD CONSTRAINT "Ball_nonStrikerId_fkey" FOREIGN KEY ("nonStrikerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ball" ADD CONSTRAINT "Ball_overId_fkey" FOREIGN KEY ("overId") REFERENCES "Over"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BallIntelligence" ADD CONSTRAINT "BallIntelligence_ballId_fkey" FOREIGN KEY ("ballId") REFERENCES "Ball"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPlayerStat" ADD CONSTRAINT "ExternalPlayerStat_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PlayerStatSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPlayerShotStat" ADD CONSTRAINT "ExternalPlayerShotStat_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PlayerStatSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundImage" ADD CONSTRAINT "GroundImage_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "Ground"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundOpeningHours" ADD CONSTRAINT "GroundOpeningHours_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "Ground"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundAmenity" ADD CONSTRAINT "GroundAmenity_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "Ground"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundReview" ADD CONSTRAINT "GroundReview_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "Ground"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundFavourite" ADD CONSTRAINT "GroundFavourite_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "Ground"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundAvailability" ADD CONSTRAINT "GroundAvailability_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "Ground"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "Ground"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizResult" ADD CONSTRAINT "QuizResult_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAnalysis" ADD CONSTRAINT "VideoAnalysis_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachBooking" ADD CONSTRAINT "CoachBooking_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorerBooking" ADD CONSTRAINT "ScorerBooking_scorerId_fkey" FOREIGN KEY ("scorerId") REFERENCES "Scorer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "TournamentPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RummyPlayer" ADD CONSTRAINT "RummyPlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "RummyGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RummyRound" ADD CONSTRAINT "RummyRound_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "RummyGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RummyScore" ADD CONSTRAINT "RummyScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RummyPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RummyScore" ADD CONSTRAINT "RummyScore_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RummyRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRole" ADD CONSTRAINT "MatchRole_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastSession" ADD CONSTRAINT "BroadcastSession_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
