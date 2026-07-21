# vpc.tf
# The full network for the EKS cluster, built by hand so every piece is visible.
# Layout: one VPC, two public subnets, two private subnets, spread across two AZs.
# Public subnets hold the ALB and NAT gateway. Private subnets hold the worker
# nodes, they reach the internet outbound through NAT but are not reachable inbound.

# The VPC itself: a private network with its own IP range.
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true # lets instances resolve DNS names
  enable_dns_hostnames = true # required for EKS and private DNS to work

  tags = {
    Name = "${var.cluster_name}-vpc"
  }
}

# Internet Gateway: the VPC's connection to the public internet.
# Public subnets route through this.
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.cluster_name}-igw"
  }
}

# Two public subnets, one per AZ.
# cidrsubnet() carves the VPC range into smaller blocks automatically:
# index 0 -> 10.0.0.0/24, index 1 -> 10.0.1.0/24
resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true # things here get a public IP

  tags = {
    Name                                        = "${var.cluster_name}-public-${count.index + 1}"
    "kubernetes.io/role/elb"                    = "1"      # internet-facing ALBs land here
    "kubernetes.io/cluster/${var.cluster_name}" = "shared" # marks subnet as this cluster's
  }
}

# Two private subnets, one per AZ.
# Offset by 10 so their ranges do not overlap the public ones:
# index 0 -> 10.0.10.0/24, index 1 -> 10.0.11.0/24
resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name                                        = "${var.cluster_name}-private-${count.index + 1}"
    "kubernetes.io/role/internal-elb"           = "1" # internal load balancers land here
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }
}

# An Elastic IP for the NAT gateway (a NAT needs a fixed public IP).
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${var.cluster_name}-nat-eip"
  }
}

# NAT Gateway: lets private subnets reach the internet outbound (to pull images
# and call AWS APIs) without being reachable from the internet. Sits in a public
# subnet. This is the main hourly cost in the VPC, so we destroy promptly.
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${var.cluster_name}-nat"
  }

  depends_on = [aws_internet_gateway.main]
}

# Route table for public subnets: send internet-bound traffic to the IGW.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.cluster_name}-public-rt"
  }
}

# Attach the public route table to both public subnets.
resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Route table for private subnets: send internet-bound traffic to the NAT.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${var.cluster_name}-private-rt"
  }
}

# Attach the private route table to both private subnets.
resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}